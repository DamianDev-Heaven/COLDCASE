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
      const bateriaValor = Number(payload.bateria);
      const tipoAlerta = bateriaValor === 0 ? 'BATERIA_AGOTADA' : 'BATERIA_BAJA';

      const newIncident = await this.incidenteService.create({
        viaje_id: viaje.id,
        telemetria_id: telemetriaId,
        tipo_alerta: tipoAlerta,
        valor_detectado: Math.trunc(bateriaValor),
        umbral_permitido: batteryLimit,
        query: (text, params) => client.query(text, params),
      });

      return { incidente: newIncident };
    }

    return null;
  }
}
