import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { IaAnalysisService } from './ia-analysis.service';

@Processor('ia-analysis-queue', { concurrency: 1 })
@Injectable()
export class IaProcessor extends WorkerHost {
  private readonly logger = new Logger(IaProcessor.name);

  constructor(
    private readonly iaAnalysisService: IaAnalysisService,
  ) {
    super();
  }

  async process(job: Job<{ viajeId: string; incidenteData: any }, any, string>): Promise<any> {
    this.logger.log(`Procesando trabajo ${job.id} de tipo ${job.name}...`);
    
    if (job.name === 'analyze-incident') {
      const { viajeId, incidenteData } = job.data;
      
      try {
        this.logger.log(`[Job ${job.id}] Ejecutando análisis de IA en segundo plano para viaje ${viajeId}...`);
        
        // Ejecutar la llamada pesada de Zep y Groq (éste método persiste el resultado internamente en 'analisis_ia')
        const iaResult = await this.iaAnalysisService.analizarEventoEnTiempoReal(
          viajeId,
          incidenteData,
        );
        
        this.logger.log(`[Job ${job.id}] Análisis completado y persistido. Diagnóstico: ${iaResult.diagnostico_tecnico}`);
        return iaResult;
      } catch (err: any) {
        this.logger.error(`Error al procesar diagnóstico de incidente en segundo plano: ${err.message}`);
        throw err;
      }
    }
    
    this.logger.warn(`Nombre de trabajo desconocido: ${job.name}`);
  }
}
