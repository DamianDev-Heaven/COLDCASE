import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { TelemetriaService } from './telemetria.service';

interface TelemetryPayload {
  viaje_id: string;
  lat: number;
  lon: number;
  temp: number;
  humedad?: number;
  bateria?: number;
  compuerta_abierta?: boolean;
  timestamp_sensor: string;
}

@Processor('telemetria-ingest-queue', { concurrency: 1 })
@Injectable()
export class TelemetriaIngestProcessor extends WorkerHost {
  private readonly logger = new Logger(TelemetriaIngestProcessor.name);

  constructor(private readonly telemetriaService: TelemetriaService) {
    super();
  }

  async process(job: Job<TelemetryPayload, unknown, string>): Promise<unknown> {
    const payload = job.data;
    this.logger.log(
      `[Ingestión Asíncrona] Procesando telemetría para viaje: ${payload.viaje_id} (Job ID: ${job.id})`,
    );

    try {
      // 1. Ejecutar el flujo de registro persistente y detectores en base de datos
      const result = await this.telemetriaService.createDirect(payload);

      this.logger.log(
        `[Ingestión Asíncrona] Telemetría registrada en DB (ID: ${result.id}) para viaje ${payload.viaje_id}`,
      );

      // 2. Si se disparó el flag de encolar IA (ej. creación o resolución de excursión), delegar al worker de IA
      if (result.incidentesParaIa && result.incidentesParaIa.length > 0) {
        for (const incidenteParaIa of result.incidentesParaIa) {
          await this.telemetriaService.enqueueIaAnalysis(
            { ...result, incidenteParaIa },
            payload,
          );
        }
      }

      return result;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `[Ingestión Asíncrona] Error crítico procesando telemetría para viaje ${payload.viaje_id}: ${errorMsg}`,
      );
      // Re-lanzamos el error para que BullMQ gestione el reintento con backoff exponencial
      throw err;
    }
  }
}
