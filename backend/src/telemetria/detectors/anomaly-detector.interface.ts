import { PoolClient } from 'pg';
import { CreateTelemetriaDto } from '../dto/create-telemetria.dto';

export interface AnomalyResult {
  incidente: any | null;
  encolarIa?: boolean;
  incidenteParaIa?: any | null;
}

export interface AnomalyDetector {
  evaluate(
    payload: CreateTelemetriaDto,
    telemetriaId: number,
    viaje: {
      id: string;
      limite_max_temp: number;
      limite_min_temp?: number | null;
      ruta_waypoints?: any;
      margen_desvio_km?: number | null;
      estado: string;
    },
    client: PoolClient,
  ): Promise<AnomalyResult | null>;
}
