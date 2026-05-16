import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Zep, ZepClient, composeContextString } from "@getzep/zep-cloud";
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

    // Decide whether to pass a custom baseUrl to the SDK.
    // The SDK already uses an environment default that includes /api/v2.
    // To avoid double "/api/v2" we only pass baseUrl if the provided ZEP_API_URL already contains "/api/v2".
    try {
      if (zepUrl && zepUrl.includes("/api/v2")) {
        this.zepClient = new ZepClient({ baseUrl: zepUrl, apiKey: zepApiKey });
      } else {
        // Let the SDK use its default environment (https://api.getzep.com/api/v2) if no explicit api/v2 is provided.
        this.zepClient = new ZepClient({ apiKey: zepApiKey });
      }
      this.logger.log("ZepClient inicializado correctamente.");
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.logger.error(`Error al inicializar ZepClient: ${error.message}`, error.stack);
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
      // Asegurar que el user exista (algunos proyectos requieren crear user antes de crear threads).
      await this.zepClient.user.add({ userId: threadId, firstName: threadId, metadata: { source: "coldcase", kind: "iot" } });
    } catch (err) {
      // Si el usuario ya existe o hay otro error, lo ignoramos y seguimos.
      this.logger.debug(`Info al asegurar user Zep para ${threadId}: ${err instanceof Error ? err.message : String(err)}`);
    }

    try {
      await this.zepClient.thread.create({ threadId, userId: threadId });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      // Si el thread ya existe u ocurre otro error, lo registramos y continuamos.
      this.logger.debug(`Info al asegurar thread Zep para ${threadId}: ${message}`);
    }

  }

  private async loadZepContext(threadId: string): Promise<string> {
    if (!this.zepClient) {
      return "Memoria no disponible temporalmente";
    }

    try {
      const response = await this.zepClient.thread.getUserContext(threadId);
      const context = response?.context ?? "";
      return context.trim() ? context : "Sin historial previo.";
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
      await this.zepClient.thread.addMessages(threadId, {
        messages: [
          {
            content: eventText,
            role: "user",
          },
          {
            content: analysisText,
            role: "assistant",
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