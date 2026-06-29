import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { AnomalyDetector, AnomalyResult } from './anomaly-detector.interface';
import { CreateTelemetriaDto } from '../dto/create-telemetria.dto';
import { IncidenteService } from '../../incidente/incidente.service';
import { GeoUtils } from '../../common/utils/geo.util';
import { TELEMETRY_CONSTANTS } from '../../common/constants/telemetry.constants';

interface ActiveIncidentRow {
  id: string;
  viaje_id: string;
  telemetria_id: number;
  tipo_alerta: string;
  valor_detectado: number;
  umbral_permitido: number;
  timestamp_bd: string;
  valor_pico: number;
}

@Injectable()
export class RouteDeviationDetector implements AnomalyDetector {
  constructor(private readonly incidenteService: IncidenteService) {}

  async evaluate(
    payload: CreateTelemetriaDto,
    telemetriaId: number,
    viaje: {
      id: string;
      ruta_waypoints?: any;
      margen_desvio_km?: number | null;
      estado: string;
    },
    client: PoolClient,
  ): Promise<AnomalyResult | null> {
    try {
      const margen =
        viaje.margen_desvio_km == null
          ? TELEMETRY_CONSTANTS.ROUTE_DEVIATION_THRESHOLD_KM
          : Number(viaje.margen_desvio_km);

      if (margen < 0) {
        return null;
      }

      // Parse, downsample and check distance
      const parsedWaypoints = GeoUtils.parseRouteWaypoints(
        viaje.ruta_waypoints,
      );
      if (parsedWaypoints.length === 0) {
        return null;
      }

      const downsampledWaypoints = GeoUtils.downsample(parsedWaypoints);
      const minKm = GeoUtils.calculateMinDistance(
        { lat: Number(payload.lat), lon: Number(payload.lon) },
        downsampledWaypoints,
      );

      // 1. Consultar Excursión Activa (FUERA_RUTA)
      const activeIncidentResult = await client.query<ActiveIncidentRow>(
        `SELECT i.id, i.viaje_id, i.telemetria_id, i.tipo_alerta, i.valor_detectado, i.umbral_permitido, i.timestamp_bd,
                COALESCE((SELECT valor_registrado FROM incidente_evento WHERE incidente_id = i.id AND tipo_evento = 'PICO_ACTUALIZADO' ORDER BY timestamp_evento DESC LIMIT 1), i.valor_pico, i.valor_detectado) as valor_pico
         FROM incidente i
         WHERE i.viaje_id = $1 
           AND i.tipo_alerta = 'FUERA_RUTA' 
           AND NOT EXISTS (
               SELECT 1 FROM incidente_evento WHERE incidente_id = i.id AND tipo_evento = 'RESUELTO'
           )
         LIMIT 1`,
        [viaje.id],
      );
      const activeIncident = activeIncidentResult.rows[0];

      const fueraRuta = minKm > margen;
      const desvioMetros = Math.round(minKm * 1000);
      const umbralMetros = Math.round(margen * 1000);

      if (fueraRuta) {
        if (!activeIncident) {
          // Caso Fuera de Ruta + No Activo: Crear incidente abierto
          const newIncident = await this.incidenteService.create({
            viaje_id: viaje.id,
            telemetria_id: telemetriaId,
            tipo_alerta: 'FUERA_RUTA',
            valor_detectado: desvioMetros,
            umbral_permitido: umbralMetros,
            valor_pico: desvioMetros,
            resuelta: false,
            query: (text, params) => client.query(text, params),
          });

          // Registrar primer evento de pico
          await client.query(
            "INSERT INTO incidente_evento (incidente_id, tipo_evento, valor_registrado) VALUES ($1, 'PICO_ACTUALIZADO', $2)",
            [newIncident.id, desvioMetros],
          );

          return {
            incidente: newIncident,
            encolarIa: true,
            incidenteParaIa: newIncident,
          };
        } else {
          // Caso Fuera de Ruta + Activo: Registrar nuevo pico si supera el pico actual
          const currentPico = Number(activeIncident.valor_pico);
          if (desvioMetros > currentPico) {
            await client.query(
              "INSERT INTO incidente_evento (incidente_id, tipo_evento, valor_registrado) VALUES ($1, 'PICO_ACTUALIZADO', $2)",
              [activeIncident.id, desvioMetros],
            );
            activeIncident.valor_pico = desvioMetros;
          }
          return { incidente: activeIncident };
        }
      } else {
        // Vehículo está en ruta
        if (activeIncident) {
          // Consultar los últimos 3 pings registrados
          const lastPingsResult = await client.query<{
            lat: string;
            lon: string;
          }>(
            'SELECT lat, lon FROM telemetria WHERE viaje_id = $1 ORDER BY timestamp_sensor DESC, id DESC LIMIT 3',
            [viaje.id],
          );
          const lastPings = lastPingsResult.rows;

          // Si hay al menos 3 pings y todos están dentro del margen
          const inRoutePings = lastPings.map((ping) => {
            const distance = GeoUtils.calculateMinDistance(
              { lat: Number(ping.lat), lon: Number(ping.lon) },
              downsampledWaypoints,
            );
            return distance <= margen;
          });

          const gracePeriodMet =
            lastPings.length >= 3 && inRoutePings.every((inRoute) => inRoute);

          if (gracePeriodMet) {
            // Registrar resolución
            await client.query(
              "INSERT INTO incidente_evento (incidente_id, tipo_evento) VALUES ($1, 'RESUELTO')",
              [activeIncident.id],
            );

            // Construir respuesta de incidente resuelto
            const resolvedIncidente = {
              ...activeIncident,
              resuelta: true,
              timestamp_fin: new Date().toISOString(),
            };

            return {
              incidente: resolvedIncidente,
              encolarIa: true,
              incidenteParaIa: resolvedIncidente,
            };
          } else {
            return { incidente: activeIncident };
          }
        }
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.warn(
        `[RouteDeviationDetector] Error al evaluar desviación de ruta (no se bloqueará la telemetría): ${errorMsg}`,
      );
    }

    return null;
  }
}
