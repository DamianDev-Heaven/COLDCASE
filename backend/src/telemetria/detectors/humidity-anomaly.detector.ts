import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { AnomalyDetector, AnomalyResult } from './anomaly-detector.interface';
import { CreateTelemetriaDto } from '../dto/create-telemetria.dto';
import { IncidenteService } from '../../incidente/incidente.service';

interface ActiveIncidentRow {
  id: string;
  viaje_id: string;
  telemetria_id: number;
  tipo_alerta: string;
  valor_detectado: number;
  umbral_permitido: number;
  timestamp_bd: string;
}

@Injectable()
export class HumidityAnomalyDetector implements AnomalyDetector {
  constructor(private readonly incidenteService: IncidenteService) {}

  async evaluate(
    payload: CreateTelemetriaDto,
    telemetriaId: number,
    viaje: {
      id: string;
      limite_min_humedad?: number | null;
      limite_max_humedad?: number | null;
      estado: string;
    },
    client: PoolClient,
  ): Promise<AnomalyResult | null> {
    if (payload.humedad == null) {
      return null;
    }

    const minHum =
      viaje.limite_min_humedad != null
        ? Number(viaje.limite_min_humedad)
        : null;
    const maxHum =
      viaje.limite_max_humedad != null
        ? Number(viaje.limite_max_humedad)
        : null;

    const fueraDeRango =
      (minHum != null && payload.humedad < minHum) ||
      (maxHum != null && payload.humedad > maxHum);

    if (fueraDeRango) {
      const activeIncidentResult = await client.query<ActiveIncidentRow>(
        `SELECT id, viaje_id, telemetria_id, tipo_alerta, valor_detectado, umbral_permitido, timestamp_bd
         FROM incidente
         WHERE viaje_id = $1 
           AND tipo_alerta = 'HUMEDAD_FUERA_RANGO' 
           AND resuelta = false
         LIMIT 1`,
        [viaje.id],
      );
      const activeIncident = activeIncidentResult.rows[0];

      if (!activeIncident) {
        const valorDetectado = payload.humedad;
        const umbralPermitido =
          maxHum != null && payload.humedad > maxHum ? maxHum : (minHum ?? 0);

        const newIncident = await this.incidenteService.create({
          viaje_id: viaje.id,
          telemetria_id: telemetriaId,
          tipo_alerta: 'HUMEDAD_FUERA_RANGO',
          valor_detectado: valorDetectado,
          umbral_permitido: umbralPermitido,
          resuelta: false,
          query: (text, params) => client.query(text, params),
        });

        return { incidente: newIncident };
      } else {
        return { incidente: activeIncident };
      }
    } else {
      const activeIncidentResult = await client.query<ActiveIncidentRow>(
        `SELECT id FROM incidente
         WHERE viaje_id = $1 
           AND tipo_alerta = 'HUMEDAD_FUERA_RANGO' 
           AND resuelta = false
         LIMIT 1`,
        [viaje.id],
      );
      const activeIncident = activeIncidentResult.rows[0];

      if (activeIncident) {
        const lastPingsResult = await client.query<{ humedad: number }>(
          'SELECT humedad FROM telemetria WHERE viaje_id = $1 ORDER BY timestamp_sensor DESC, id DESC LIMIT 3',
          [viaje.id],
        );
        const lastPings = lastPingsResult.rows;

        const gracePeriodMet =
          lastPings.length >= 3 &&
          lastPings.every((p) => {
            const h = Number(p.humedad);
            return (
              (minHum == null || h >= minHum) && (maxHum == null || h <= maxHum)
            );
          });

        if (gracePeriodMet) {
          await client.query(
            "INSERT INTO incidente_evento (incidente_id, tipo_evento, comentario) VALUES ($1, 'RESUELTO', 'Humedad restablecida a rangos normales')",
            [activeIncident.id],
          );

          await client.query(
            'UPDATE incidente SET resuelta = true, timestamp_fin = CURRENT_TIMESTAMP WHERE id = $1',
            [activeIncident.id],
          );

          const resolvedIncidente = {
            ...activeIncident,
            resuelta: true,
            timestamp_fin: new Date().toISOString(),
          };

          return { incidente: resolvedIncidente };
        } else {
          return { incidente: activeIncident };
        }
      }
    }

    return null;
  }
}
