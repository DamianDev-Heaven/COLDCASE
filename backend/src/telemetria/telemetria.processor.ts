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
  timestamp_sensor: string;
}

@Processor('telemetria-contingency-queue', { concurrency: 1 })
@Injectable()
export class TelemetriaContingencyProcessor extends WorkerHost {
  private readonly logger = new Logger(TelemetriaContingencyProcessor.name);

  constructor(private readonly telemetriaService: TelemetriaService) {
    super();
  }

  async process(job: Job<TelemetryPayload, unknown, string>): Promise<unknown> {
    this.logger.log(
      `[Contingencia] Procesando telemetría encolada para viaje: ${job.data?.viaje_id} (ID Trabajo: ${job.id})`,
    );

    if (job.name === 'process-contingency') {
      const payload = job.data;

      try {
        // Registrar directamente en base de datos sin volver a activar la lógica de contingencia en caso de fallo
        const result = await this.telemetriaService.createDirect(payload);
        this.logger.log(
          `[Contingencia] Telemetría registrada en DB exitosamente para viaje ${payload.viaje_id}`,
        );
        return result;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        this.logger.error(
          `[Contingencia] Reintento fallido para viaje ${payload.viaje_id}: ${errorMsg}`,
        );
        // Lanzamos el error para que BullMQ registre el fallo y reintente según la política de backoff
        throw err;
      }
    }

    this.logger.warn(
      `Nombre de trabajo desconocido en cola de contingencia: ${job.name}`,
    );
  }
}
