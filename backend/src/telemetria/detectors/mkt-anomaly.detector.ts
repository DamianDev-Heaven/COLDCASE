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
export class MktAnomalyDetector implements AnomalyDetector {
  constructor(private readonly incidenteService: IncidenteService) {}

  async evaluate(
    payload: CreateTelemetriaDto,
    telemetriaId: number,
    viaje: {
      id: string;
      limite_max_temp: number;
      estado: string;
    },
    client: PoolClient,
  ): Promise<AnomalyResult | null> {
    try {
      // 1. Obtener las últimas 15 lecturas de temperatura del viaje
      const limit = 15;
      const historyResult = await client.query<{ temp: string }>(
        'SELECT temp FROM telemetria WHERE viaje_id = $1 ORDER BY timestamp_sensor DESC, id DESC LIMIT $2',
        [viaje.id, limit],
      );
      
      const rows = historyResult.rows;
      if (rows.length < 5) {
        // Necesitamos al menos 5 puntos para calcular un MKT representativo
        return null;
      }

      // 2. Calcular MKT
      // Formula: MKT = (dH / R) / -ln( (sum(e^(-dH / R / T))) / n )
      // Usando dH/R = 10000 K (basado en energía de activación de 83.144 kJ/mol y R = 8.3144 * 10^-3 kJ/mol*K)
      const DH_R = 10000;
      let sumExp = 0;
      
      for (const row of rows) {
        const tempC = Number(row.temp);
        const tempK = tempC + 273.15; // Convertir a Kelvin
        sumExp += Math.exp(-DH_R / tempK);
      }
      
      const averageExp = sumExp / rows.length;
      const mktK = DH_R / -Math.log(averageExp);
      const mktC = Number((mktK - 273.15).toFixed(2)); // Convertir de vuelta a Celsius

      // 3. Evaluar anomalía
      const isMktExceeded = mktC > viaje.limite_max_temp;

      if (isMktExceeded) {
        // Verificar si ya existe una alerta MKT activa para este viaje
        const activeIncidentResult = await client.query<ActiveIncidentRow>(
          `SELECT id, viaje_id, telemetria_id, tipo_alerta, valor_detectado, umbral_permitido, timestamp_bd
           FROM incidente
           WHERE viaje_id = $1 
             AND tipo_alerta = 'MKT_EXCEDIDO' 
             AND resuelta = false
           LIMIT 1`,
          [viaje.id],
        );
        const activeIncident = activeIncidentResult.rows[0];

        if (!activeIncident) {
          const newIncident = await this.incidenteService.create({
            viaje_id: viaje.id,
            telemetria_id: telemetriaId,
            tipo_alerta: 'MKT_EXCEDIDO',
            valor_detectado: mktC,
            umbral_permitido: viaje.limite_max_temp,
            resuelta: false,
            query: (text, params) => client.query(text, params),
          });

          return { incidente: newIncident };
        } else {
          return { incidente: activeIncident };
        }
      } else {
        // Resolver alerta de MKT si el MKT actual regresó a la normalidad
        const activeIncidentResult = await client.query<ActiveIncidentRow>(
          `SELECT id FROM incidente
           WHERE viaje_id = $1 
             AND tipo_alerta = 'MKT_EXCEDIDO' 
             AND resuelta = false
           LIMIT 1`,
          [viaje.id],
        );
        const activeIncident = activeIncidentResult.rows[0];

        if (activeIncident) {
          // Para resolver MKT, requerimos que el MKT calculado esté por debajo del límite
          await client.query(
            "INSERT INTO incidente_evento (incidente_id, tipo_evento, comentario) VALUES ($1, 'RESUELTO', 'Temperatura Cinética Media (MKT) normalizada')",
            [activeIncident.id],
          );

          await client.query(
            "UPDATE incidente SET resuelta = true, timestamp_fin = CURRENT_TIMESTAMP WHERE id = $1",
            [activeIncident.id],
          );

          const resolvedIncidente = {
            ...activeIncident,
            resuelta: true,
            timestamp_fin: new Date().toISOString(),
          };

          return { incidente: resolvedIncidente };
        }
      }
    } catch (err) {
      console.warn(`[MktAnomalyDetector] Error calculando MKT: ${err.message}`);
    }

    return null;
  }
}
