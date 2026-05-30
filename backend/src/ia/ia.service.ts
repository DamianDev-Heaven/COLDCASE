import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ZepGraphSearchResult } from './zep-memory.service';
import {
  IaAnalysisService,
  AnalisisResultado,
  AnalisisViajeInput,
} from './ia-analysis.service';
import type {
  AnalisisIaResultado,
  AnalisisIaRow,
  TelemetriaInput,
} from './ia.interfaces';

@Injectable()
export class IaService {
  constructor(
    private readonly iaAnalysisService: IaAnalysisService,
    @InjectQueue('ia-analysis-queue') private readonly iaQueue: Queue,
  ) {}

  analizarEvento(payload: AnalisisViajeInput): Promise<AnalisisResultado> {
    return this.iaAnalysisService.analizarEvento(payload);
  }

  simularAnalisisDeFallo(
    iot_id: string,
    temperaturaActual: number,
    bateriaActual: number,
  ): Promise<AnalisisResultado> {
    return this.iaAnalysisService.simularAnalisisDeFallo(
      iot_id,
      temperaturaActual,
      bateriaActual,
    );
  }

  /**
   * Proxy al motor híbrido de tiempo real.
   * Punto de entrada para integración futura desde TelemetriaService.
   */
  analizarEventoEnTiempoReal(
    viajeId: string,
    telemetriaActual: TelemetriaInput,
  ): Promise<AnalisisIaResultado> {
    return this.iaAnalysisService.analizarEventoEnTiempoReal(
      viajeId,
      telemetriaActual,
    );
  }

  /**
   * Historial de análisis de IA para un viaje específico.
   */
  obtenerHistorialAnalisis(viajeId: string): Promise<AnalisisIaRow[]> {
    return this.iaAnalysisService.obtenerHistorialAnalisis(viajeId);
  }

  /**
   * Obtiene el contexto relacional extraído por el Standalone Graph de Zep.
   */
  obtenerContextoGrafo(
    viajeId: string,
    query: string,
  ): Promise<{ messages: string; messageCount: number }> {
    return this.iaAnalysisService.obtenerContextoGrafo(viajeId, query);
  }

  /**
   * Pausa la ejecución de la cola BullMQ.
   */
  async pauseQueue() {
    await this.iaQueue.pause();
    return { status: 'paused', isPaused: await this.iaQueue.isPaused() };
  }

  /**
   * Reanuda la ejecución de la cola BullMQ.
   */
  async resumeQueue() {
    await this.iaQueue.resume();
    return { status: 'active', isPaused: await this.iaQueue.isPaused() };
  }

  /**
   * Obtiene el estado actual de la cola BullMQ con métricas en tiempo real.
   */
  async getQueueStatus() {
    return {
      isPaused: await this.iaQueue.isPaused(),
      waiting: await this.iaQueue.getWaitingCount(),
      active: await this.iaQueue.getActiveCount(),
      completed: await this.iaQueue.getCompletedCount(),
      failed: await this.iaQueue.getFailedCount(),
    };
  }

  /**
   * Realiza una búsqueda directa en el Grafo Global de Zep y retorna nodos y aristas.
   */
  buscarEnGrafoGlobal(
    query: string,
    viajeId?: string,
  ): Promise<ZepGraphSearchResult> {
    return this.iaAnalysisService.buscarEnGrafoGlobal(query, viajeId);
  }

  sintetizarGrafo(
    query: string,
    viajeId?: string,
  ): Promise<{ sintesis: string; nodes: any[]; edges: any[] }> {
    return this.iaAnalysisService.sintetizarGrafo(query, viajeId);
  }
}
