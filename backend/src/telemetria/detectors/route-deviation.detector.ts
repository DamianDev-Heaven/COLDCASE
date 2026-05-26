import { Injectable } from '@nestjs/common';
import { PoolClient } from 'pg';
import { AnomalyDetector, AnomalyResult } from './anomaly-detector.interface';
import { CreateTelemetriaDto } from '../dto/create-telemetria.dto';
import { IncidenteService } from '../../incidente/incidente.service';
import { GeoUtils } from '../../common/utils/geo.util';
import { TELEMETRY_CONSTANTS } from '../../common/constants/telemetry.constants';

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

      if (minKm > margen) {
        const newIncident = await this.incidenteService.create({
          viaje_id: viaje.id,
          telemetria_id: telemetriaId,
          tipo_alerta: 'FUERA_RUTA',
          valor_detectado: Math.round(minKm * 1000), // metros
          umbral_permitido: Math.round(margen * 1000), // metros
          query: (text, params) => client.query(text, params),
        });

        return { incidente: newIncident };
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
