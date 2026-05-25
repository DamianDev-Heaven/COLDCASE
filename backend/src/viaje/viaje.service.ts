import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DbService } from '../db/db.service';
import { IaAnalysisService } from '../ia/ia-analysis.service';

type Waypoint = { lat: number; lon: number };

type FeatureCollectionRoute = {
  features?: Array<{
    geometry?: {
      coordinates?: Array<[number, number]>;
    };
    properties?: Record<string, unknown>;
  }>;
};

@Injectable()
export class ViajeService {
  constructor(
    private readonly db: DbService,
    private readonly config: ConfigService,
    private readonly iaAnalysisService: IaAnalysisService,
    @InjectQueue('pdf-queue') private readonly pdfQueue: Queue,
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
        this.config.get<string>('OSRM_BASE_URL') || 'http://localhost:5000';
      const coordinates = points
        .map((point) => `${point.lon},${point.lat}`)
        .join(';');
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
      console.error('OSRM request error:', error);
      return null;
    }
  }

  async previewRoute(points: Array<{ lon: number; lat: number }>) {
    const routeData = await this.fetchOsrmRoute(points);

    return {
      osrm_usado: Boolean(routeData),
      distancia_km: routeData ? routeData.distance / 1000 : null,
      geometry:
        routeData?.geometry ??
        points.map((point) => [point.lon, point.lat] as [number, number]),
    };
  }

  private parseLegacyRoutePoints(
    rutaWaypoints?: Record<string, unknown> | Array<Waypoint>,
  ) {
    if (!rutaWaypoints) {
      return null;
    }

    if (Array.isArray(rutaWaypoints)) {
      return rutaWaypoints;
    }

    const featureCollection = rutaWaypoints as FeatureCollectionRoute;
    const coordinates = featureCollection.features?.[0]?.geometry?.coordinates;

    if (!Array.isArray(coordinates) || coordinates.length < 2) {
      return null;
    }

    return coordinates.map(([lon, lat]) => ({ lat, lon }));
  }

  private async resolveRouteEndpoints(payload: {
    sucursal_origen_id?: string;
    sucursal_destino_id?: string;
    origen_lon?: number;
    origen_lat?: number;
    destino_lon?: number;
    destino_lat?: number;
    ruta_waypoints?: Record<string, unknown> | Array<Waypoint>;
  }) {
    if (payload.sucursal_origen_id && payload.sucursal_destino_id) {
      const result = await this.db.query<{
        origen_id: string;
        origen_nombre: string;
        origen_empresa_nombre: string;
        origen_lat: number;
        origen_lon: number;
        destino_id: string;
        destino_nombre: string;
        destino_empresa_nombre: string;
        destino_lat: number;
        destino_lon: number;
      }>(
        `SELECT
          so.id AS origen_id,
          so.nombre AS origen_nombre,
          eo.nombre AS origen_empresa_nombre,
          so.lat AS origen_lat,
          so.lon AS origen_lon,
          sd.id AS destino_id,
          sd.nombre AS destino_nombre,
          ed.nombre AS destino_empresa_nombre,
          sd.lat AS destino_lat,
          sd.lon AS destino_lon
        FROM sucursal so
        INNER JOIN empresa eo ON eo.id = so.empresa_id
        CROSS JOIN sucursal sd
        INNER JOIN empresa ed ON ed.id = sd.empresa_id
        WHERE so.id = $1 AND sd.id = $2`,
        [payload.sucursal_origen_id, payload.sucursal_destino_id],
      );

      const row = result.rows[0];
      if (row) {
        return {
          points: [
            { lat: Number(row.origen_lat), lon: Number(row.origen_lon) },
            { lat: Number(row.destino_lat), lon: Number(row.destino_lon) },
          ],
          metadata: row,
        };
      }
    }

    if (
      typeof payload.origen_lat === 'number' &&
      typeof payload.origen_lon === 'number' &&
      typeof payload.destino_lat === 'number' &&
      typeof payload.destino_lon === 'number'
    ) {
      return {
        points: [
          { lat: payload.origen_lat, lon: payload.origen_lon },
          { lat: payload.destino_lat, lon: payload.destino_lon },
        ],
        metadata: null,
      };
    }

    const legacyPoints = this.parseLegacyRoutePoints(payload.ruta_waypoints);
    if (legacyPoints && legacyPoints.length >= 2) {
      return {
        points: [legacyPoints[0], legacyPoints[legacyPoints.length - 1]],
        metadata: null,
      };
    }

    throw new Error(
      'Debes enviar sucursal_origen_id y sucursal_destino_id, o coordenadas origen/destino, o una ruta legacy con al menos dos puntos.',
    );
  }

  async create(payload: {
    transporte_id: string;
    limite_max_temp: number;
    limite_min_temp?: number;
    tipo_producto?: string;
    valor_comercial?: number;
    peso_kg?: number;
    volumen_m3?: number;
    sucursal_origen_id?: string;
    sucursal_destino_id?: string;
    origen_lon?: number;
    origen_lat?: number;
    destino_lon?: number;
    destino_lat?: number;
    ruta_waypoints?: Record<string, unknown> | Array<Waypoint>;
    margen_desvio_km?: number;
    inicio_viaje?: string;
    final_viaje?: string;
    estado?: 'pendiente' | 'en_curso' | 'pausado' | 'cancelado' | 'finalizado';
  }) {
    const resolvedRoute = await this.resolveRouteEndpoints(payload);
    const routeData = await this.fetchOsrmRoute(resolvedRoute.points);
    const routeSource = routeData ? 'osrm' : 'fallback';
    const routeLabels = resolvedRoute.metadata
      ? {
          origen_sucursal_id: resolvedRoute.metadata.origen_id,
          destino_sucursal_id: resolvedRoute.metadata.destino_id,
          origen_sucursal_nombre: resolvedRoute.metadata.origen_nombre,
          destino_sucursal_nombre: resolvedRoute.metadata.destino_nombre,
          origen_empresa_nombre: resolvedRoute.metadata.origen_empresa_nombre,
          destino_empresa_nombre: resolvedRoute.metadata.destino_empresa_nombre,
        }
      : {};

    // Build waypoints structure (geometry from OSRM or fallback to origin/destination)
    const ruta_waypoints = routeData
      ? {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              geometry: {
                type: 'LineString',
                coordinates: routeData.geometry,
              },
              properties: {
                distancia_km: routeData.distance / 1000,
                osrm_usado: true,
                ruta_origen: routeSource,
                ...routeLabels,
              },
            },
          ],
        }
      : {
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              geometry: {
                type: 'LineString',
                coordinates: [
                  [payload.origen_lon, payload.origen_lat],
                  [payload.destino_lon, payload.destino_lat],
                ],
              },
              properties: {
                distancia_km: null,
                osrm_usado: false,
                ruta_origen: routeSource,
                ...routeLabels,
              },
            },
          ],
        };

    const result = await this.db.query(
      'INSERT INTO viaje (transporte_id, limite_max_temp, limite_min_temp, tipo_producto, valor_comercial, peso_kg, volumen_m3, ruta_waypoints, margen_desvio_km, inicio_viaje, final_viaje, estado, sucursal_origen_id, sucursal_destino_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id, transporte_id, limite_max_temp, limite_min_temp, tipo_producto, valor_comercial, peso_kg, volumen_m3, ruta_waypoints, margen_desvio_km, inicio_viaje, final_viaje, estado, sucursal_origen_id, sucursal_destino_id',
      [
        payload.transporte_id,
        payload.limite_max_temp,
        payload.limite_min_temp ?? null,
        payload.tipo_producto ?? null,
        payload.valor_comercial ?? null,
        payload.peso_kg ?? null,
        payload.volumen_m3 ?? null,
        JSON.stringify(ruta_waypoints),
        payload.margen_desvio_km ?? null,
        payload.inicio_viaje ?? null,
        payload.final_viaje ?? null,
        payload.estado ?? 'pendiente',
        payload.sucursal_origen_id ?? null,
        payload.sucursal_destino_id ?? null,
      ],
    );

    return {
      ...result.rows[0],
      ruta_origen: routeSource,
      ...routeLabels,
    };
  }

  async findAll() {
    const result = await this.db.query(
      `SELECT
        v.id,
        v.transporte_id,
        v.limite_max_temp,
        v.limite_min_temp,
        v.tipo_producto,
        v.valor_comercial,
        v.peso_kg,
        v.volumen_m3,
        v.ruta_waypoints,
        v.margen_desvio_km,
        v.inicio_viaje,
        v.final_viaje,
        v.estado,
        v.auditoria_ia,
        v.sucursal_origen_id,
        v.sucursal_destino_id,
        so.nombre AS origen_sucursal_nombre,
        so.lat AS origen_lat,
        so.lon AS origen_lon,
        eo.nombre AS origen_empresa_nombre,
        sd.nombre AS destino_sucursal_nombre,
        sd.lat AS destino_lat,
        sd.lon AS destino_lon,
        ed.nombre AS destino_empresa_nombre
      FROM viaje v
      LEFT JOIN sucursal so ON so.id = v.sucursal_origen_id
      LEFT JOIN empresa eo ON eo.id = so.empresa_id
      LEFT JOIN sucursal sd ON sd.id = v.sucursal_destino_id
      LEFT JOIN empresa ed ON ed.id = sd.empresa_id
      ORDER BY v.inicio_viaje DESC NULLS LAST`,
    );

    return result.rows;
  }

  async findEnCurso() {
    const result = await this.db.query(
      `SELECT
        v.id,
        v.transporte_id,
        v.limite_max_temp,
        v.limite_min_temp,
        v.tipo_producto,
        v.valor_comercial,
        v.peso_kg,
        v.volumen_m3,
        v.ruta_waypoints,
        v.margen_desvio_km,
        v.inicio_viaje,
        v.final_viaje,
        v.estado,
        v.auditoria_ia,
        v.sucursal_origen_id,
        v.sucursal_destino_id,
        so.nombre AS origen_sucursal_nombre,
        so.lat AS origen_lat,
        so.lon AS origen_lon,
        eo.nombre AS origen_empresa_nombre,
        sd.nombre AS destino_sucursal_nombre,
        sd.lat AS destino_lat,
        sd.lon AS destino_lon,
        ed.nombre AS destino_empresa_nombre
      FROM viaje v
      LEFT JOIN sucursal so ON so.id = v.sucursal_origen_id
      LEFT JOIN empresa eo ON eo.id = so.empresa_id
      LEFT JOIN sucursal sd ON sd.id = v.sucursal_destino_id
      LEFT JOIN empresa ed ON ed.id = sd.empresa_id
      WHERE v.estado IN ('en_curso', 'pendiente')
      ORDER BY
        CASE v.estado WHEN 'en_curso' THEN 0 ELSE 1 END,
        v.inicio_viaje DESC NULLS LAST`,
    );

    return result.rows;
  }

  async findOne(id: string) {
    const result = await this.db.query(
      `SELECT
        v.id,
        v.transporte_id,
        v.limite_max_temp,
        v.limite_min_temp,
        v.tipo_producto,
        v.valor_comercial,
        v.peso_kg,
        v.volumen_m3,
        v.ruta_waypoints,
        v.margen_desvio_km,
        v.inicio_viaje,
        v.final_viaje,
        v.estado,
        v.auditoria_ia,
        v.sucursal_origen_id,
        v.sucursal_destino_id,
        so.nombre AS origen_sucursal_nombre,
        so.lat AS origen_lat,
        so.lon AS origen_lon,
        eo.nombre AS origen_empresa_nombre,
        sd.nombre AS destino_sucursal_nombre,
        sd.lat AS destino_lat,
        sd.lon AS destino_lon,
        ed.nombre AS destino_empresa_nombre
      FROM viaje v
      LEFT JOIN sucursal so ON so.id = v.sucursal_origen_id
      LEFT JOIN empresa eo ON eo.id = so.empresa_id
      LEFT JOIN sucursal sd ON sd.id = v.sucursal_destino_id
      LEFT JOIN empresa ed ON ed.id = sd.empresa_id
      WHERE v.id = $1`,
      [id],
    );

    const viaje = result.rows[0];
    if (!viaje) {
      throw new NotFoundException('Viaje no encontrado.');
    }

    return viaje;
  }

  async iniciar(id: string) {
    const viaje = await this.findOne(id);
    if (viaje.estado !== 'pendiente') {
      throw new Error(
        `El viaje ${id} no está en estado pendiente (estado actual: ${viaje.estado}).`,
      );
    }
    await this.db.query(
      `UPDATE viaje SET estado = 'en_curso', inicio_viaje = NOW() WHERE id = $1`,
      [id],
    );
    return this.findOne(id);
  }

  async finalizar(id: string) {
    await this.findOne(id);

    // 1. Actualizar el estado en la DB
    await this.db.query(
      `UPDATE viaje SET estado = 'finalizado', final_viaje = NOW() WHERE id = $1`,
      [id],
    );

    // 2. Cerrar Excursiones Huérfanas
    await this.db.query(
      `UPDATE incidente SET resuelta = true, timestamp_fin = NOW() WHERE viaje_id = $1 AND resuelta = false`,
      [id],
    );

    // 3. Desacoplar la Auditoría y el PDF encolando el trabajo asíncrono
    await this.pdfQueue.add('generate-trip-pdf', { viajeId: id });

    // 4. Retorno Inmediato del estado del viaje actualizado
    return this.findOne(id);
  }
}
