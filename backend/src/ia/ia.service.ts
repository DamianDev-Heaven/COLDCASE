import { Injectable } from '@nestjs/common';
import {
  IaAnalysisService,
  AnalisisResultado,
  AnalisisViajeInput,
} from './ia-analysis.service';

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
}
