import { Injectable } from '@nestjs/common';
import {
  IaAnalysisService,
  AnalisisResultado,
  AnalisisViajeInput,
} from './ia-analysis.service';
import type { AnalisisIaResultado, AnalisisIaRow, TelemetriaInput } from './ia.interfaces';

@Injectable()
export class IaService {
  constructor(private readonly iaAnalysisService: IaAnalysisService) {}

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
  obtenerContextoGrafo(viajeId: string, query: string) {
    return this.iaAnalysisService.obtenerContextoGrafo(viajeId, query);
  }
}
