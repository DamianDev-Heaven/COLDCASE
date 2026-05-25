import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { IaAnalysisService } from './ia-analysis.service';
import { TelemetriaInput } from './ia.interfaces';

@Processor('ia-analysis-queue', { concurrency: 1 })
@Injectable()
export class IaProcessor extends WorkerHost {
  private readonly logger = new Logger(IaProcessor.name);

  constructor(
    private readonly iaAnalysisService: IaAnalysisService,
  ) {
    super();
  }

  async process(job: Job<{ viajeId: string; incidenteData: TelemetriaInput }, unknown, string>): Promise<unknown> {
    this.logger.log(`Procesando trabajo ${job.id} de tipo ${job.name}...`);
    
    if (job.name === 'analyze-incident') {
      const { viajeId, incidenteData } = job.data;
      
      try {
        this.logger.log(`[Job ${job.id}] Ejecutando análisis de IA en segundo plano para viaje ${viajeId}...`);
        
        const iaResult = await this.iaAnalysisService.analizarEventoEnTiempoReal(
          viajeId,
          incidenteData,
        );
        
        this.logger.log(`[Job ${job.id}] Análisis completado y persistido. Diagnóstico: ${iaResult.diagnostico_tecnico}`);
        return iaResult;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(`Error al procesar diagnóstico de incidente en segundo plano: ${message}`);
        throw err;
      }
    }
    
    this.logger.warn(`Nombre de trabajo desconocido: ${job.name}`);
  }
}
