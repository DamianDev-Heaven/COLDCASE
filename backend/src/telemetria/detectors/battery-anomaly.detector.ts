import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { AnomalyDetector, AnomalyResult } from './anomaly-detector.interface';
import { CreateTelemetriaDto } from '../dto/create-telemetria.dto';
import { IncidenteService } from '../../incidente/incidente.service';
import { TELEMETRY_CONSTANTS } from '../../common/constants/telemetry.constants';

@Injectable()
export class BatteryAnomalyDetector implements AnomalyDetector {
  constructor(private readonly incidenteService: IncidenteService) {}

  async evaluate(
    payload: CreateTelemetriaDto,
    telemetriaId: number,
    viaje: {
      id: string;
      estado: string;
    },
    client: PoolClient,
  ): Promise<AnomalyResult | null> {
    const batteryLimit = TELEMETRY_CONSTANTS.BATTERY_THRESHOLD;
    
    if (payload.bateria != null && Number(payload.bateria) <= batteryLimit) {
      const newIncident = await this.incidenteService.create({
        viaje_id: viaje.id,
        telemetria_id: telemetriaId,
        tipo_alerta: 'BATERIA_BAJA',
        valor_detectado: Math.trunc(Number(payload.bateria)),
        umbral_permitido: batteryLimit,
        query: (text, params) => client.query(text, params),
      });

      return { incidente: newIncident };
    }

    return null;
  }
}
