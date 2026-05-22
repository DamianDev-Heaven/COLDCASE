import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Groq from 'groq-sdk';
import { DbService } from '../db/db.service';

export interface Waypoint {
  lat: number;
  lon: number;
}

export interface AnalisisResultado {
  nivel_riesgo: 'CRITICO' | 'ALTO' | 'MODERADO' | 'DESCONOCIDO';
  diagnostico_tecnico: string;
  accion_mitigacion: string;
  fuente: 'reglas' | 'llm';
  contexto?: {
    limite_max_temp: number;
    temperatura_actual: number;
    bateria_actual: number;
    desvio_km?: number | null;
    distancia_ruta_km?: number | null;
    osrm_usado: boolean;
  };
}

export interface AnalisisViajeInput {
  iot_id: string;
  temperaturaActual: number;
  bateriaActual: number;
  viaje_id?: string;
  limite_max_temp?: number;
  margen_desvio_km?: number;
  latitudActual?: number;
  longitudActual?: number;
  ruta_waypoints?: { waypoints?: Waypoint[] } | Waypoint[];
  modo?: 'auto' | 'deterministic' | 'llm';
}

type ViajeContext = {
  limite_max_temp: number;
  margen_desvio_km?: number | null;
  ruta_waypoints: { waypoints?: Waypoint[] } | Waypoint[];
};

type RouteMetrics = {
  distanciaRutaKm: number | null;
  desvioKm: number | null;
  osrmUsado: boolean;
};

type Point = { lat: number; lon: number };

@Injectable()
export class IaAnalysisService {
  private readonly logger = new Logger(IaAnalysisService.name);
  private readonly groqClient: Groq | null;
  private readonly osrmBaseUrl: string;
  private readonly analysisMode: 'auto' | 'deterministic' | 'llm';
  private readonly defaultModelName: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly db: DbService,
  ) {
    const groqApiKey =
      this.configService.get<string>('LLM_API_KEY') ??
      this.configService.get<string>('GROQ_API_KEY');

    this.analysisMode =
      this.configService.get<'auto' | 'deterministic' | 'llm'>(
        'AI_ANALYSIS_MODE',
      ) ?? 'deterministic';
    this.osrmBaseUrl = this.normalizeBaseUrl(
      this.configService.get<string>('OSRM_BASE_URL') ??
        'http://localhost:5000',
    );
    this.defaultModelName =
      this.configService.get<string>('LLM_MODEL_NAME') ??
      this.configService.get<string>('GROQ_MODEL_NAME') ??
      'llama-3.3-70b-versatile';

    this.groqClient = groqApiKey ? new Groq({ apiKey: groqApiKey }) : null;
  }

  async simularAnalisisDeFallo(
    iot_id: string,
    temperaturaActual: number,
    bateriaActual: number,
  ): Promise<AnalisisResultado> {
    return this.analizarEvento({
      iot_id,
      temperaturaActual,
      bateriaActual,
      modo: 'auto',
    });
  }

  async analizarEvento(
    payload: AnalisisViajeInput,
  ): Promise<AnalisisResultado> {
    const viajeContext = await this.loadViajeContext(payload.viaje_id);
    const limiteMaxTemp =
      payload.limite_max_temp ?? viajeContext?.limite_max_temp ?? 5;
    const margenDesvioKm =
      payload.margen_desvio_km ?? viajeContext?.margen_desvio_km ?? 10;
    const rutaSource = payload.ruta_waypoints ?? viajeContext?.ruta_waypoints;
    const currentPoint =
      payload.latitudActual != null && payload.longitudActual != null
        ? { lat: payload.latitudActual, lon: payload.longitudActual }
        : undefined;

    const routeMetrics = await this.resolveRouteMetrics(
      rutaSource,
      currentPoint,
    );
    const analysisMode = this.resolveAnalysisMode(payload.modo);
    const deterministic = this.buildDeterministicAnalysis({
      temperaturaActual: payload.temperaturaActual,
      limite_max_temp: limiteMaxTemp,
      bateriaActual: payload.bateriaActual,
      desvioKm: routeMetrics.desvioKm,
      distanciaRutaKm: routeMetrics.distanciaRutaKm,
      margen_desvio_km: margenDesvioKm,
      osrmUsado: routeMetrics.osrmUsado,
    });

    if (analysisMode !== 'llm' || !this.groqClient) {
      return deterministic;
    }

    try {
      const prompt = this.buildPrompt({
        iotId: payload.iot_id,
        temperaturaActual: payload.temperaturaActual,
        bateriaActual: payload.bateriaActual,
        limiteMaxTemp,
        margenDesvioKm,
        routeMetrics,
      });

      const controller = new AbortController();
      const abortTimeoutId = setTimeout(() => controller.abort(), 6000);

      try {
        const completion = await this.groqClient.chat.completions.create(
          {
            messages: [{ role: 'user', content: prompt }],
            model: this.defaultModelName,
            response_format: { type: 'json_object' },
          },
          { signal: controller.signal },
        );

        const rawContent = completion.choices[0]?.message?.content ?? '{}';
        const parsed = JSON.parse(rawContent) as Partial<AnalisisResultado>;

        return {
          nivel_riesgo: parsed.nivel_riesgo ?? deterministic.nivel_riesgo,
          diagnostico_tecnico:
            parsed.diagnostico_tecnico ?? deterministic.diagnostico_tecnico,
          accion_mitigacion:
            parsed.accion_mitigacion ?? deterministic.accion_mitigacion,
          fuente: 'llm',
          contexto: deterministic.contexto,
        };
      } finally {
        clearTimeout(abortTimeoutId);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Fallback a reglas por error de IA: ${message}`);
      return deterministic;
    }
  }

  private resolveAnalysisMode(
    requestedMode: AnalisisViajeInput['modo'],
  ): 'auto' | 'deterministic' | 'llm' {
    if (requestedMode && requestedMode !== 'auto') {
      return requestedMode;
    }

    return this.analysisMode;
  }

  private normalizeBaseUrl(url: string): string {
    return url.trim().replace(/\/+$/, '');
  }

  private extractWaypoints(
    source: { waypoints?: Waypoint[] } | Waypoint[] | undefined,
  ): Waypoint[] {
    if (!source) {
      return [];
    }

    const points = Array.isArray(source) ? source : (source.waypoints ?? []);
    return points.filter(
      (point): point is Waypoint =>
        Number.isFinite(point?.lat) && Number.isFinite(point?.lon),
    );
  }

  private toRadians(value: number): number {
    return (value * Math.PI) / 180;
  }

  private haversineDistanceKm(pointA: Point, pointB: Point): number {
    const earthRadiusKm = 6371;
    const deltaLat = this.toRadians(pointB.lat - pointA.lat);
    const deltaLon = this.toRadians(pointB.lon - pointA.lon);
    const latA = this.toRadians(pointA.lat);
    const latB = this.toRadians(pointB.lat);

    const a =
      Math.sin(deltaLat / 2) ** 2 +
      Math.cos(latA) * Math.cos(latB) * Math.sin(deltaLon / 2) ** 2;
    return 2 * earthRadiusKm * Math.asin(Math.sqrt(a));
  }

  private distancePointToSegmentKm(
    point: Point,
    start: Point,
    end: Point,
  ): number {
    const averageLatRad = this.toRadians((start.lat + end.lat) / 2);
    const metersPerDegreeLat = 111_132;
    const metersPerDegreeLon = 111_320 * Math.cos(averageLatRad);

    const project = (value: Point) => ({
      x: value.lon * metersPerDegreeLon,
      y: value.lat * metersPerDegreeLat,
    });

    const projectedPoint = project(point);
    const projectedStart = project(start);
    const projectedEnd = project(end);

    const segmentX = projectedEnd.x - projectedStart.x;
    const segmentY = projectedEnd.y - projectedStart.y;
    const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY;

    if (segmentLengthSquared === 0) {
      return (
        Math.hypot(
          projectedPoint.x - projectedStart.x,
          projectedPoint.y - projectedStart.y,
        ) / 1000
      );
    }

    const rawProjection =
      ((projectedPoint.x - projectedStart.x) * segmentX +
        (projectedPoint.y - projectedStart.y) * segmentY) /
      segmentLengthSquared;
    const projection = Math.min(1, Math.max(0, rawProjection));

    const closestPoint = {
      x: projectedStart.x + projection * segmentX,
      y: projectedStart.y + projection * segmentY,
    };

    return (
      Math.hypot(
        projectedPoint.x - closestPoint.x,
        projectedPoint.y - closestPoint.y,
      ) / 1000
    );
  }

  private pointToPathDistanceKm(point: Point, path: Waypoint[]): number {
    if (path.length === 0) {
      return 0;
    }

    if (path.length === 1) {
      return this.haversineDistanceKm(point, path[0]);
    }

    let minDistance = Number.POSITIVE_INFINITY;

    for (let index = 0; index < path.length - 1; index += 1) {
      const currentDistance = this.distancePointToSegmentKm(
        point,
        path[index],
        path[index + 1],
      );
      minDistance = Math.min(minDistance, currentDistance);
    }

    return minDistance;
  }

  private computePolylineDistanceKm(points: Waypoint[]): number {
    if (points.length < 2) {
      return 0;
    }

    let total = 0;
    for (let index = 0; index < points.length - 1; index += 1) {
      total += this.haversineDistanceKm(points[index], points[index + 1]);
    }

    return total;
  }

  private formatRouteCoordinates(points: Waypoint[]): string {
    return points.map((point) => `${point.lon},${point.lat}`).join(';');
  }

  private async fetchOsrmRoute(
    points: Waypoint[],
  ): Promise<{ distanciaRutaKm: number | null; geometria: Waypoint[] } | null> {
    if (points.length < 2) {
      return null;
    }

    const coordinates = this.formatRouteCoordinates(points);
    const osrmUrl = `${this.osrmBaseUrl}/route/v1/driving/${coordinates}?overview=full&geometries=geojson&steps=false`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
      const response = await fetch(osrmUrl, { signal: controller.signal });
      if (!response.ok) {
        return null;
      }

      const payload = (await response.json()) as {
        routes?: Array<{
          distance?: number;
          geometry?: { coordinates?: Array<[number, number]> };
        }>;
      };

      const route = payload.routes?.[0];
      if (!route?.geometry?.coordinates?.length) {
        return null;
      }

      return {
        distanciaRutaKm:
          typeof route.distance === 'number' ? route.distance / 1000 : null,
        geometria: route.geometry.coordinates.map(([lon, lat]) => ({
          lat,
          lon,
        })),
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`No se pudo consultar OSRM: ${message}`);
      return null;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async resolveRouteMetrics(
    routeSource: { waypoints?: Waypoint[] } | Waypoint[] | undefined,
    currentPoint: Point | undefined,
  ): Promise<RouteMetrics> {
    const points = this.extractWaypoints(routeSource);
    if (points.length < 2) {
      return {
        distanciaRutaKm: null,
        desvioKm: null,
        osrmUsado: false,
      };
    }

    const osrmRoute = await this.fetchOsrmRoute(points);
    const pathForDeviation = osrmRoute?.geometria ?? points;
    const desvioKm = currentPoint
      ? this.pointToPathDistanceKm(currentPoint, pathForDeviation)
      : null;

    return {
      distanciaRutaKm:
        osrmRoute?.distanciaRutaKm ?? this.computePolylineDistanceKm(points),
      desvioKm,
      osrmUsado: Boolean(osrmRoute),
    };
  }

  private evaluarRiesgo(args: {
    temperaturaActual: number;
    limite_max_temp: number;
    bateriaActual: number;
    desvioKm: number | null;
    margen_desvio_km: number;
  }): AnalisisResultado['nivel_riesgo'] {
    const {
      temperaturaActual,
      limite_max_temp,
      bateriaActual,
      desvioKm,
      margen_desvio_km,
    } = args;
    const desvioActual = desvioKm ?? 0;

    if (
      temperaturaActual >= limite_max_temp + 4 ||
      bateriaActual <= 10 ||
      desvioActual >= Math.max(10, margen_desvio_km * 2)
    ) {
      return 'CRITICO';
    }

    if (
      temperaturaActual >= limite_max_temp ||
      bateriaActual <= 25 ||
      desvioActual >= Math.max(5, margen_desvio_km)
    ) {
      return 'ALTO';
    }

    return 'MODERADO';
  }

  private buildDeterministicAnalysis(args: {
    temperaturaActual: number;
    limite_max_temp: number;
    bateriaActual: number;
    desvioKm: number | null;
    distanciaRutaKm: number | null;
    margen_desvio_km: number;
    osrmUsado: boolean;
  }): AnalisisResultado {
    const {
      temperaturaActual,
      limite_max_temp,
      bateriaActual,
      desvioKm,
      distanciaRutaKm,
      margen_desvio_km,
      osrmUsado,
    } = args;
    const nivel_riesgo = this.evaluarRiesgo({
      temperaturaActual,
      limite_max_temp,
      bateriaActual,
      desvioKm,
      margen_desvio_km,
    });

    const desvioTexto =
      desvioKm != null ? `${desvioKm.toFixed(2)} km` : 'sin ubicacion actual';
    const distanciaTexto =
      distanciaRutaKm != null
        ? `${distanciaRutaKm.toFixed(2)} km`
        : 'sin ruta calculada';

    let diagnostico_tecnico = `Temperatura ${temperaturaActual}°C frente a limite ${limite_max_temp}°C.`;
    if (desvioKm != null) {
      diagnostico_tecnico += ` Desvio actual ${desvioTexto}.`;
    }
    diagnostico_tecnico += ` Bateria ${bateriaActual}%. Ruta ${distanciaTexto}.`;

    let accion_mitigacion = 'Mantener monitoreo y seguir telemetria.';
    if (nivel_riesgo === 'CRITICO') {
      accion_mitigacion =
        'Detener el viaje, revisar cadena de frio y validar geolocalizacion manualmente.';
    } else if (nivel_riesgo === 'ALTO') {
      accion_mitigacion =
        'Avisar al operador, revisar ruta y confirmar estado del equipo de refrigeracion.';
    } else {
      accion_mitigacion =
        'Mantener seguimiento activo y preparar alerta preventiva.';
    }

    return {
      nivel_riesgo,
      diagnostico_tecnico,
      accion_mitigacion,
      fuente: 'reglas',
      contexto: {
        limite_max_temp,
        temperatura_actual: temperaturaActual,
        bateria_actual: bateriaActual,
        desvio_km: desvioKm,
        distancia_ruta_km: distanciaRutaKm,
        osrm_usado: osrmUsado,
      },
    };
  }

  private buildPrompt(args: {
    iotId: string;
    temperaturaActual: number;
    bateriaActual: number;
    limiteMaxTemp: number;
    margenDesvioKm: number;
    routeMetrics: RouteMetrics;
  }): string {
    const {
      iotId,
      temperaturaActual,
      bateriaActual,
      limiteMaxTemp,
      margenDesvioKm,
      routeMetrics,
    } = args;
    return [
      'Eres un analista de IA para logística de cadena de frio y seguimiento de rutas.',
      'Responde siempre con un JSON puro y sin texto adicional.',
      `IoT: ${iotId}`,
      `Temperatura actual: ${temperaturaActual}°C`,
      `Bateria actual: ${bateriaActual}%`,
      `Limite maximo de temperatura: ${limiteMaxTemp}°C`,
      `Margen de desvio: ${margenDesvioKm} km`,
      `Distancia de la ruta: ${routeMetrics.distanciaRutaKm != null ? `${routeMetrics.distanciaRutaKm.toFixed(2)} km` : 'no disponible'}`,
      `Desvio actual: ${routeMetrics.desvioKm != null ? `${routeMetrics.desvioKm.toFixed(2)} km` : 'no disponible'}`,
      `OSRM usado: ${routeMetrics.osrmUsado ? 'si' : 'no'}`,
      'Propiedades requeridas: "nivel_riesgo" (CRITICO, ALTO o MODERADO), "diagnostico_tecnico" y "accion_mitigacion".',
    ].join('\n');
  }

  private async loadViajeContext(
    viajeId: string | undefined,
  ): Promise<ViajeContext | null> {
    if (!viajeId) {
      return null;
    }

    const result = await this.db.query<{
      limite_max_temp: number;
      margen_desvio_km: number | null;
      ruta_waypoints: { waypoints?: Waypoint[] } | Waypoint[];
    }>(
      'SELECT limite_max_temp, margen_desvio_km, ruta_waypoints FROM viaje WHERE id = $1',
      [viajeId],
    );

    const viaje = result.rows[0];
    if (!viaje) {
      return null;
    }

    return viaje;
  }
}
