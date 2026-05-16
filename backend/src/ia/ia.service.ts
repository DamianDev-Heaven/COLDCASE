import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Zep, ZepClient } from "@getzep/zep-js";
import Groq from "groq-sdk";

export interface AnalisisResultado {
  nivel_riesgo: "CRITICO" | "ALTO" | "MODERADO" | "DESCONOCIDO";
  diagnostico_tecnico: string;
  accion_mitigacion: string;
}

@Injectable()
export class IaService {
  private readonly logger = new Logger(IaService.name);
  private zepClient: ZepClient | null = null;
  private groqClient: Groq;

  constructor(private readonly configService: ConfigService) {
    const zepUrl = this.configService.get<string>("ZEP_API_URL");
    const zepApiKey = this.configService.get<string>("ZEP_API_KEY");
    const groqApiKey =
      this.configService.get<string>("LLM_API_KEY") ?? this.configService.get<string>("GROQ_API_KEY");
    const groqModelName =
      this.configService.get<string>("LLM_MODEL_NAME") ??
      this.configService.get<string>("GROQ_MODEL_NAME") ??
      "llama-3.3-70b-versatile";

    this.groqClient = new Groq({
      apiKey: groqApiKey,
    });

    const normalizedZepUrl = this.normalizeZepBaseUrl(zepUrl);

    if (normalizedZepUrl && zepApiKey) {
      try {
        this.zepClient = new ZepClient({ baseUrl: normalizedZepUrl, apiKey: zepApiKey });
        this.logger.log("ZepClient inicializado correctamente.");
      } catch (err: unknown) {
        const error = err instanceof Error ? err : new Error(String(err));
        this.logger.error(`Error al inicializar ZepClient: ${error.message}`, error.stack);
      }
    } else {
      this.logger.warn("ZEP_API_URL o ZEP_API_KEY no definidos. Zep Cloud no inicializado.");
    }

    this.defaultModelName = groqModelName;
  }

  private normalizeZepBaseUrl(zepUrl: string | undefined): string | undefined {
    if (!zepUrl) {
      return undefined;
    }

    const trimmedUrl = zepUrl.trim().replace(/\/+$/, "");
    if (!trimmedUrl) {
      return undefined;
    }

    return trimmedUrl.endsWith("/api/v2") ? trimmedUrl : `${trimmedUrl}/api/v2`;
  }

  private readonly defaultModelName: string;

  private async ensureZepIdentity(threadId: string): Promise<void> {
    if (!this.zepClient) {
      return;
    }

    try {
      await this.zepClient.memory.getSession(threadId);
      return;
    } catch {
      // Si no existe, la creamos abajo.
    }

    try {
      await this.zepClient.memory.addSession({
        sessionId: threadId,
        userId: threadId,
        metadata: {
          source: "coldcase",
          kind: "iot",
        },
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`No se pudo crear la sesión Zep para ${threadId}: ${message}`);
    }

  }

  private async loadZepContext(threadId: string): Promise<string> {
    if (!this.zepClient) {
      return "Memoria no disponible temporalmente";
    }

    try {
      const memory = await this.zepClient.memory.get(threadId, { lastn: 5 });
      const lines: string[] = [];

      if (memory.summary?.content) {
        lines.push(`Resumen: ${memory.summary.content}`);
      }

      if (memory.messages?.length) {
        for (const message of memory.messages) {
          if (message.content) {
            lines.push(`${message.role ?? "message"}: ${message.content}`);
          }
        }
      }

      if (memory.relevantFacts?.length) {
        for (const fact of memory.relevantFacts) {
          if (fact.fact) {
            lines.push(`Hecho relevante: ${fact.fact}`);
          }
        }
      }

      if (memory.facts?.length) {
        lines.push(`Facts: ${memory.facts.join(" | ")}`);
      }

      const contextBlock = lines.join("\n");
      return contextBlock.trim() ? contextBlock : "Sin historial previo.";
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Error al obtener historial de Zep Cloud para iot_id ${threadId}: ${message}`);
      return "Sin historial previo.";
    }
  }

  private async persistZepEvent(threadId: string, eventText: string, analysisText: string): Promise<void> {
    if (!this.zepClient) {
      return;
    }

    try {
      await this.zepClient.memory.add(threadId, {
        messages: [
          {
            content: eventText,
            role: "user",
            createdAt: new Date().toISOString(),
          },
          {
            content: analysisText,
            role: "assistant",
            createdAt: new Date().toISOString(),
          },
        ],
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Error al guardar el nuevo evento en Zep Cloud para iot_id ${threadId}: ${message}`);
    }
  }

  async simularAnalisisDeFallo(
    iot_id: string,
    temperaturaActual: number,
    bateriaActual: number,
  ): Promise<AnalisisResultado> {
    await this.ensureZepIdentity(iot_id);

    const historialContexto = await this.loadZepContext(iot_id);
    const eventoActual = `Evento IoT ${iot_id}: Temperatura ${temperaturaActual}°C, batería ${bateriaActual}%.`;

    const prompt = `
Eres un analista de IA para logística de cadena de frío.
Evalúa el siguiente evento de anomalía.
Payload actual: Temperatura: ${temperaturaActual}°C, Batería: ${bateriaActual}%.
Historial reciente (últimos 5 mensajes):
${historialContexto}

Responde EXCLUSIVAMENTE con un JSON puro con las siguientes propiedades:
- "nivel_riesgo": Solo puede ser "CRITICO", "ALTO" o "MODERADO".
- "diagnostico_tecnico": string (máximo 30 palabras).
- "accion_mitigacion": string.
No incluyas texto fuera del JSON, ni markdown.
`;

    let analisisFinal: AnalisisResultado;

    try {
      const controller = new AbortController();
      const abortTimeoutId = setTimeout(() => controller.abort(), 3000);

      const groqPromise = this.groqClient.chat.completions.create(
        {
          messages: [{ role: "user", content: prompt }],
          model: this.defaultModelName,
          response_format: { type: "json_object" },
        },
        { signal: controller.signal as AbortSignal },
      );

      let raceTimeoutId: ReturnType<typeof setTimeout> | undefined;
      const timeoutPromise = new Promise<never>((_, reject) => {
        raceTimeoutId = setTimeout(() => reject(new Error("GroqTimeout")), 3000);
      });

      const completion = await Promise.race([groqPromise, timeoutPromise]);
      clearTimeout(abortTimeoutId);
      if (raceTimeoutId) {
        clearTimeout(raceTimeoutId);
      }

      const groqRespuestaText = completion.choices[0]?.message?.content ?? "{}";

      try {
        const parsed = JSON.parse(groqRespuestaText) as Partial<AnalisisResultado>;
        analisisFinal = {
          nivel_riesgo: parsed.nivel_riesgo ?? "DESCONOCIDO",
          diagnostico_tecnico:
            parsed.diagnostico_tecnico ?? "Fallo al procesar respuesta del modelo (JSON inválido).",
          accion_mitigacion: parsed.accion_mitigacion ?? "Pedir intervención manual",
        };
      } catch (parseError: unknown) {
        const error = parseError instanceof Error ? parseError : new Error(String(parseError));
        this.logger.error(`Error al parsear respuesta JSON de Groq: ${error.message}`);
        analisisFinal = {
          nivel_riesgo: "DESCONOCIDO",
          diagnostico_tecnico: "Fallo al procesar respuesta del modelo (JSON inválido).",
          accion_mitigacion: "Pedir intervención manual",
        };
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === "GroqTimeout" || message === "AbortError") {
        this.logger.error(`Timeout en inferencia de Groq para iot_id ${iot_id}.`);
        analisisFinal = {
          nivel_riesgo: "DESCONOCIDO",
          diagnostico_tecnico: "Timeout en inferencia",
          accion_mitigacion: "Intervención manual inmediata",
        };
      } else {
        this.logger.error(`Error inesperado en inferencia de Groq: ${message}`);
        analisisFinal = {
          nivel_riesgo: "DESCONOCIDO",
          diagnostico_tecnico: "Error en servicio de inferencia.",
          accion_mitigacion: "Intervención manual inmediata",
        };
      }
    }

    const analysisText = `[Diagnóstico IA] Riesgo: ${analisisFinal.nivel_riesgo}. Detalle: ${analisisFinal.diagnostico_tecnico}. Mitigación: ${analisisFinal.accion_mitigacion}`;
    await this.persistZepEvent(iot_id, eventoActual, analysisText);

    return analisisFinal;
  }
}