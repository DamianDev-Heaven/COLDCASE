import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { AnomalyDetector, AnomalyResult } from './anomaly-detector.interface';
import { CreateTelemetriaDto } from '../dto/create-telemetria.dto';
import { IncidenteService } from '../../incidente/incidente.service';
import { GeoUtils } from '../../common/utils/geo.util';

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
export class GateSecurityDetector implements AnomalyDetector {
  constructor(private readonly incidenteService: IncidenteService) {}

  async evaluate(
    payload: CreateTelemetriaDto,
    telemetriaId: number,
    viaje: {
      id: string;
      sucursal_origen_id?: string | null;
      sucursal_destino_id?: string | null;
      estado: string;
    },
    client: PoolClient,
  ): Promise<AnomalyResult | null> {
    const isDoorOpen = !!payload.compuerta_abierta;

    // Obtener las coordenadas de las sucursales de origen y destino
    let origin: { lat: number; lon: number } | null = null;
    let dest: { lat: number; lon: number } | null = null;

    if (viaje.sucursal_origen_id || viaje.sucursal_destino_id) {
      const ids = [viaje.sucursal_origen_id, viaje.sucursal_destino_id].filter(
        Boolean,
      );
      if (ids.length > 0) {
        const sucursalesResult = await client.query<{
          id: string;
          lat: string;
          lon: string;
        }>('SELECT id, lat, lon FROM sucursal WHERE id = ANY($1)', [ids]);

        for (const row of sucursalesResult.rows) {
          if (row.id === viaje.sucursal_origen_id) {
            origin = { lat: Number(row.lat), lon: Number(row.lon) };
          }
          if (row.id === viaje.sucursal_destino_id) {
            dest = { lat: Number(row.lat), lon: Number(row.lon) };
          }
        }
      }
    }

    // Si no hay sucursales configuradas, no podemos hacer geofencing de puerta de forma confiable
    if (!origin && !dest) {
      return null;
    }

    // Calcular distancias en kilómetros (100 metros = 0.1 km)
    const geofenceRadiusKm = 0.1;
    let nearOrigin = false;
    let nearDest = false;

    if (origin) {
      const dist = GeoUtils.haversineKm(
        payload.lat,
        payload.lon,
        origin.lat,
        origin.lon,
      );
      if (dist <= geofenceRadiusKm) {
        nearOrigin = true;
      }
    }

    if (dest) {
      const dist = GeoUtils.haversineKm(
        payload.lat,
        payload.lon,
        dest.lat,
        dest.lon,
      );
      if (dist <= geofenceRadiusKm) {
        nearDest = true;
      }
    }

    const inTransit = !nearOrigin && !nearDest;

    if (isDoorOpen && inTransit) {
      // Puerta abierta fuera de zona autorizada -> Registrar Alerta de Seguridad
      const activeIncidentResult = await client.query<ActiveIncidentRow>(
        `SELECT id, viaje_id, telemetria_id, tipo_alerta, valor_detectado, umbral_permitido, timestamp_bd
         FROM incidente
         WHERE viaje_id = $1 
           AND tipo_alerta = 'APERTURA_NO_AUTORIZADA' 
           AND resuelta = false
         LIMIT 1`,
        [viaje.id],
      );
      const activeIncident = activeIncidentResult.rows[0];

      if (!activeIncident) {
        // Registrar alerta de seguridad (umbral permitido es 0, representando compuerta cerrada / normal)
        const newIncident = await this.incidenteService.create({
          viaje_id: viaje.id,
          telemetria_id: telemetriaId,
          tipo_alerta: 'APERTURA_NO_AUTORIZADA',
          valor_detectado: 1, // 1 = ABIERTA
          umbral_permitido: 0, // 0 = CERRADA
          resuelta: false,
          query: (text, params) => client.query(text, params),
        });

        return { incidente: newIncident, encolarIa: true, incidenteParaIa: newIncident };
      } else {
        return { incidente: activeIncident };
      }
    } else if (!isDoorOpen) {
      // Puerta cerrada -> Verificar si hay incidente activo de APERTURA_NO_AUTORIZADA para resolverlo
      const activeIncidentResult = await client.query<ActiveIncidentRow>(
        `SELECT id FROM incidente
         WHERE viaje_id = $1 
           AND tipo_alerta = 'APERTURA_NO_AUTORIZADA' 
           AND resuelta = false
         LIMIT 1`,
        [viaje.id],
      );
      const activeIncident = activeIncidentResult.rows[0];

      if (activeIncident) {
        // Consultar los últimos 3 pings registrados
        const lastPingsResult = await client.query<{
          compuerta_abierta: boolean;
        }>(
          'SELECT compuerta_abierta FROM telemetria WHERE viaje_id = $1 ORDER BY timestamp_sensor DESC, id DESC LIMIT 3',
          [viaje.id],
        );
        const lastPings = lastPingsResult.rows;

        // Si todos los últimos pings (hasta 3) tienen la compuerta cerrada
        const gracePeriodMet =
          lastPings.length >= 3 && lastPings.every((p) => !p.compuerta_abierta);

        if (gracePeriodMet) {
          await client.query(
            "INSERT INTO incidente_evento (incidente_id, tipo_evento, comentario) VALUES ($1, 'RESUELTO', 'Compuerta cerrada y asegurada en tránsito')",
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
        }
      }
    }

    return null;
  }
}
