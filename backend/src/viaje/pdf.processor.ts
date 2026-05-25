import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { IaAnalysisService } from '../ia/ia-analysis.service';

@Processor('pdf-queue', { concurrency: 1 })
@Injectable()
export class PdfProcessor extends WorkerHost {
  private readonly logger = new Logger(PdfProcessor.name);

  constructor(private readonly iaAnalysisService: IaAnalysisService) {
    super();
  }

  async process(
    job: Job<{ viajeId: string }, unknown, string>,
  ): Promise<unknown> {
    this.logger.log(`Procesando trabajo ${job.id} de tipo ${job.name}...`);

    if (job.name === 'generate-trip-pdf') {
      const { viajeId } = job.data;
      try {
        this.logger.log(`[Job ${job.id}] Generando auditoría final y PDF en segundo plano para viaje ${viajeId}...`);
        const auditText = await this.iaAnalysisService.generateFinalAudit(viajeId);
        this.logger.log(`[Job ${job.id}] Auditoría completada y persistida. Texto de auditoría: ${auditText.substring(0, 100)}...`);
        return { success: true, auditText };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(`Error al procesar auditoría de viaje en segundo plano: ${message}`);
        throw err;
      }
    }

    this.logger.warn(`Nombre de trabajo desconocido: ${job.name}`);
  }
}
