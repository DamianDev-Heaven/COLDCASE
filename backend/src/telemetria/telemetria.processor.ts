import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { TelemetriaService } from './telemetria.service';

@Processor('telemetria-contingency-queue', { concurrency: 1 })
@Injectable()
export class TelemetriaContingencyProcessor extends WorkerHost {
  private readonly logger = new Logger(TelemetriaContingencyProcessor.name);

  constructor(private readonly telemetriaService: TelemetriaService) {
    super();
  }

  async process(job: Job<any, unknown, string>): Promise<unknown> {
    this.logger.log(`[Contingencia] Procesando telemetría encolada para viaje: ${job.data?.viaje_id} (ID Trabajo: ${job.id})`);

    if (job.name === 'process-contingency') {
      const payload = job.data;

      try {
        // Registrar directamente en base de datos sin volver a activar la lógica de contingencia en caso de fallo
        const result = await this.telemetriaService.createDirect(payload);
        this.logger.log(`[Contingencia] Telemetría registrada en DB exitosamente para viaje ${payload.viaje_id}`);
        return result;
      } catch (err: any) {
        this.logger.error(`[Contingencia] Reintento fallido para viaje ${payload.viaje_id}: ${err.message}`);
        // Lanzamos el error para que BullMQ registre el fallo y reintente según la política de backoff
        throw err;
      }
    }

    this.logger.warn(`Nombre de trabajo desconocido en cola de contingencia: ${job.name}`);
  }
}
