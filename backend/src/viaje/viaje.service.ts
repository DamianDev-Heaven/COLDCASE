import { Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DbService } from "../db/db.service";

@Injectable()
export class ViajeService {
  constructor(
    private readonly db: DbService,
    private readonly config: ConfigService,
  ) {}

  private async fetchOsrmRoute(
    points: Array<{ lon: number; lat: number }>,
  ): Promise<{
    geometry: Array<[number, number]>;
    distance: number;
  } | null> {
    try {
      if (points.length < 2) {
        return null;
      }

      const osrmBaseUrl =
        this.config.get<string>("OSRM_BASE_URL") ||
        "http://localhost:5000";
      const coordinates = points.map((point) => `${point.lon},${point.lat}`).join(";");
      const url = `${osrmBaseUrl}/route/v1/driving/${coordinates}?geometries=geojson`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) {
        return null;
      }

      const data = (await response.json()) as {
        routes?: Array<{
          geometry: { coordinates: Array<[number, number]> };
          distance: number;
        }>;
      };

      if (data.routes && data.routes.length > 0) {
        const route = data.routes[0];
        return {
          geometry: route.geometry.coordinates,
          distance: route.distance,
        };
      }

      return null;
    } catch (error) {
      console.error("OSRM request error:", error);
      return null;
    }
  }

  async previewRoute(points: Array<{ lon: number; lat: number }>) {
    const routeData = await this.fetchOsrmRoute(points);

    return {
      osrm_usado: Boolean(routeData),
      distancia_km: routeData ? routeData.distance / 1000 : null,
      geometry: routeData?.geometry ?? points.map((point) => [point.lon, point.lat] as [number, number]),
    };
  }

  async create(payload: {
    transporte_id: string;
    limite_max_temp: number;
    origen_lon: number;
    origen_lat: number;
    destino_lon: number;
    destino_lat: number;
    margen_desvio_km?: number;
    inicio_viaje?: string;
    final_viaje?: string;
    estado?: "pendiente" | "en_curso" | "pausado" | "cancelado" | "finalizado";
  }) {
    // Fetch route from OSRM
    const routeData = await this.fetchOsrmRoute(
      [
        { lon: payload.origen_lon, lat: payload.origen_lat },
        { lon: payload.destino_lon, lat: payload.destino_lat },
      ],
    );
    const routeSource = routeData ? "osrm" : "fallback";

    // Build waypoints structure (geometry from OSRM or fallback to origin/destination)
    const ruta_waypoints = routeData
      ? {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              geometry: {
                type: "LineString",
                coordinates: routeData.geometry,
              },
              properties: {
                distancia_km: routeData.distance / 1000,
                osrm_usado: true,
                ruta_origen: routeSource,
              },
            },
          ],
        }
      : {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              geometry: {
                type: "LineString",
                coordinates: [
                  [payload.origen_lon, payload.origen_lat],
                  [payload.destino_lon, payload.destino_lat],
                ],
              },
              properties: {
                distancia_km: null,
                osrm_usado: false,
                ruta_origen: routeSource,
              },
            },
          ],
        };

    const result = await this.db.query(
      "INSERT INTO viaje (transporte_id, limite_max_temp, ruta_waypoints, margen_desvio_km, inicio_viaje, final_viaje, estado) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, transporte_id, limite_max_temp, ruta_waypoints, margen_desvio_km, inicio_viaje, final_viaje, estado",
      [
        payload.transporte_id,
        payload.limite_max_temp,
        JSON.stringify(ruta_waypoints),
        payload.margen_desvio_km ?? null,
        payload.inicio_viaje ?? null,
        payload.final_viaje ?? null,
        payload.estado ?? "pendiente",
      ],
    );

    return {
      ...result.rows[0],
      ruta_origen: routeSource,
    };
  }

  async findAll() {
    const result = await this.db.query(
      "SELECT id, transporte_id, limite_max_temp, ruta_waypoints, margen_desvio_km, inicio_viaje, final_viaje, estado FROM viaje ORDER BY inicio_viaje DESC NULLS LAST",
    );

    return result.rows;
  }

  async findOne(id: string) {
    const result = await this.db.query(
      "SELECT id, transporte_id, limite_max_temp, ruta_waypoints, margen_desvio_km, inicio_viaje, final_viaje, estado FROM viaje WHERE id = $1",
      [id],
    );

    const viaje = result.rows[0];
    if (!viaje) {
      throw new NotFoundException("Viaje no encontrado.");
    }

    return viaje;
  }
}
