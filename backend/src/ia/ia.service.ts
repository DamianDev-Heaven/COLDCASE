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

    if (zepUrl && zepApiKey) {
      try {
        this.zepClient = new ZepClient({ baseUrl: zepUrl, apiKey: zepApiKey });
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

  private readonly defaultModelName: string;

  async simularAnalisisDeFallo(
    iot_id: string,
    temperaturaActual: number,
    bateriaActual: number,
  ): Promise<AnalisisResultado> {
    let historialContexto = "Memoria no disponible temporalmente";

    try {
      if (this.zepClient) {
        try {
          await this.zepClient.memory.getSession(iot_id);
        } catch {
          await this.zepClient.memory.addSession({ sessionId: iot_id });
        }

        const memory = await this.zepClient.memory.get(iot_id);
        if (memory?.messages?.length) {
          historialContexto = memory.messages
            .slice(-5)
            .map((m: Zep.Message) => `${m.role ?? m.roleType}: ${m.content ?? ""}`)
            .join("\n");
        } else {
          historialContexto = "Sin historial previo.";
        }
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Error al obtener historial de Zep Cloud para iot_id ${iot_id}: ${message}`);
    }

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

    try {
      if (this.zepClient) {
        const nuevoEventoContent = `[Evento] Temperatura: ${temperaturaActual}°C, Batería: ${bateriaActual}%. [Diagnóstico] Riesgo: ${analisisFinal.nivel_riesgo}, Diagnóstico: ${analisisFinal.diagnostico_tecnico}, Mitigación: ${analisisFinal.accion_mitigacion}`;

        await this.zepClient.memory.add(iot_id, {
          messages: [
            {
              role: "system",
              content: nuevoEventoContent,
              roleType: Zep.RoleType.SystemRole,
            } as Zep.Message,
          ],
        });
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Error al guardar el nuevo evento en Zep Cloud para iot_id ${iot_id}: ${message}`);
    }

    return analisisFinal;
  }
}