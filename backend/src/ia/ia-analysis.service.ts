import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Groq from 'groq-sdk';
import { DbService } from '../db/db.service';
import { ZepMemoryService } from './zep-memory.service';
import type {
  AnalisisIaResultado,
  AnalisisIaRow,
  FuenteAnalisis,
  NivelRiesgo,
  TelemetriaInput,
} from './ia.interfaces';

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

type ViajeMetadata = {
  tipo_producto: string;
  valor_comercial: number;
  limite_max_temp: number;
  limite_min_temp: number;
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
  private readonly osrmBaseUrl: string;
  private readonly analysisMode: 'auto' | 'deterministic' | 'llm';
  private readonly defaultModelName: string;

  private static readonly REALTIME_MODEL = 'llama3-70b-8192';

  constructor(
    private readonly configService: ConfigService,
    private readonly db: DbService,
    @Optional() @Inject('GROQ_CLIENT') private readonly groqClient: Groq | null,
    private readonly zepMemory: ZepMemoryService,
  ) {
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

    // 1. Recuperar contexto de anomalías previas desde el Grafo Global (Zep)
    const mensajeSensorCorto = `Temp=${payload.temperaturaActual}°C, Batería=${payload.bateriaActual}%, Desvío=${routeMetrics.desvioKm}km`;
    const { messages: historialZep } = await this.zepMemory.recuperarContextoGlobal(
      payload.viaje_id || '',
      mensajeSensorCorto, // Query de búsqueda en el grafo
    );

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
            messages: [
              { role: 'system', content: 'Eres un experto en logística de cadena de frío.' },
              { role: 'system', content: `Contexto Base de Conocimiento Global (Grafo):\n${historialZep || 'Ninguno.'}` },
              { role: 'user', content: prompt }
            ],
            model: this.defaultModelName,
            response_format: { type: 'json_object' },
          },
          { signal: controller.signal },
        );

        const rawContent = completion.choices[0]?.message?.content ?? '{}';
        const parsed = JSON.parse(rawContent) as Partial<AnalisisResultado>;

        const respuestaFinal = {
          nivel_riesgo: parsed.nivel_riesgo ?? deterministic.nivel_riesgo,
          diagnostico_tecnico:
            parsed.diagnostico_tecnico ?? deterministic.diagnostico_tecnico,
          accion_mitigacion:
            parsed.accion_mitigacion ?? deterministic.accion_mitigacion,
          fuente: 'llm' as const,
          contexto: deterministic.contexto,
        };

        // 2. Guardar la nueva interacción de forma asíncrona en Zep
        const mensajeSensor = `Viaje=${payload.viaje_id}. Sensor: Temp=${payload.temperaturaActual}°C, Batería=${payload.bateriaActual}%, Desvío=${routeMetrics.desvioKm}km`;
        const respuestaIA = JSON.stringify({
          nivel_riesgo: respuestaFinal.nivel_riesgo,
          diagnostico_tecnico: respuestaFinal.diagnostico_tecnico,
          accion_mitigacion: respuestaFinal.accion_mitigacion,
        });

        if (payload.viaje_id) {
          this.zepMemory
            .guardarInteraccion(payload.viaje_id, mensajeSensor, respuestaIA)
            .catch((err: unknown) => {
              const msg = err instanceof Error ? err.message : String(err);
              this.logger.warn(`Zep: guardado no bloqueante falló (analizarEvento): ${msg}`);
            });
        }

        return respuestaFinal;
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

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // MOTOR HÍBRIDO EN TIEMPO REAL (Groq + Zep + PostgreSQL)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * Punto de entrada público para análisis en tiempo real.
   *
   * Diseñado para que TelemetriaService lo invoque con una sola línea:
   *   await this.iaAnalysis.analizarEventoEnTiempoReal(viaje_id, telemetria);
   *
   * Flujo interno:
   *  1. Consulta metadata del viaje (tipo_producto, valor_comercial, límites)
   *  2. Recupera historial de anomalías desde Zep (fallo silencioso)
   *  3. Ejecuta inferencia con Groq (llama3-70b-8192, JSON mode)
   *  4. Si Groq falla → Circuit Breaker → reglas deterministas
   *  5. Persiste resultado en tabla analisis_ia
   *  6. Guarda interacción en Zep (async, no bloqueante)
   */
  async analizarEventoEnTiempoReal(
    viajeId: string,
    telemetriaActual: TelemetriaInput,
  ): Promise<AnalisisIaResultado> {
    const viajeMeta = await this.loadViajeMetadata(viajeId);
    const queryGrafo = `Anomalía actual: Temperatura ${telemetriaActual.temp}°C, Batería ${telemetriaActual.bateria ?? 'N/A'}%`;
    const { messages: historialZep } = await this.zepMemory.recuperarContextoGlobal(viajeId, queryGrafo);

    let nivel_riesgo: NivelRiesgo;
    let diagnostico_tecnico: string;
    let accion_mitigacion: string;
    let fuente: FuenteAnalisis;

    try {
      if (!this.groqClient) {
        throw new Error('Groq client no disponible');
      }

      const resultado = await this.inferirConGroq(
        viajeMeta,
        telemetriaActual,
        historialZep,
      );
      nivel_riesgo = resultado.nivel_riesgo;
      diagnostico_tecnico = resultado.diagnostico_tecnico;
      accion_mitigacion = resultado.accion_mitigacion;
      fuente = 'groq_llm';
    } catch (error: unknown) {
      const fallback = this.evaluarReglasDuras(viajeMeta, telemetriaActual);
      nivel_riesgo = fallback.nivel_riesgo;
      diagnostico_tecnico = fallback.diagnostico_tecnico;
      accion_mitigacion = fallback.accion_mitigacion;
      fuente = 'reglas_fallback';

      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Circuit Breaker activado → fallback determinista: ${message}`,
      );
    }

    const registro = await this.persistirAnalisis({
      viaje_id: viajeId,
      telemetria_id: telemetriaActual.id,
      nivel_riesgo,
      diagnostico_tecnico,
      accion_mitigacion,
      fuente,
    });

    // Guardar en Zep de forma asíncrona — nunca bloquea ni crashea
    const mensajeSensor = `Telemetría: temp=${telemetriaActual.temp}°C, humedad=${telemetriaActual.humedad ?? 'N/A'}%, batería=${telemetriaActual.bateria ?? 'N/A'}%, ubicación=(${telemetriaActual.lat}, ${telemetriaActual.lon}), timestamp=${telemetriaActual.timestamp_sensor}`;
    const respuestaIA = JSON.stringify({ nivel_riesgo, diagnostico_tecnico, accion_mitigacion });

    this.zepMemory
      .guardarInteraccion(viajeId, mensajeSensor, respuestaIA, {
        viaje_id: viajeId,
        telemetria_id: telemetriaActual.id,
        fuente,
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Zep: guardado no bloqueante falló: ${msg}`);
      });

    return registro;
  }

  /**
   * Obtiene el historial de análisis de IA para un viaje,
   * ordenado por fecha descendente.
   */
  async obtenerHistorialAnalisis(viajeId: string): Promise<AnalisisIaRow[]> {
    const result = await this.db.query<AnalisisIaRow>(
      `SELECT id, viaje_id, telemetria_id, nivel_riesgo, diagnostico_tecnico,
              accion_mitigacion, fuente, version_modelo, created_at
       FROM analisis_ia
       WHERE viaje_id = $1
       ORDER BY created_at DESC`,
      [viajeId],
    );
    return result.rows;
  }

  // ── Zep Memory (delegado a ZepMemoryService) ──────────────────

  // ── Inferencia Groq ─────────────────────────────────────────────

  private async inferirConGroq(
    viajeMeta: ViajeMetadata,
    telemetria: TelemetriaInput,
    historialZep: string,
  ): Promise<{
    nivel_riesgo: NivelRiesgo;
    diagnostico_tecnico: string;
    accion_mitigacion: string;
  }> {
    const systemPrompt = this.buildSystemPromptTiempoReal();
    const userPrompt = this.buildUserPromptTiempoReal(
      viajeMeta,
      telemetria,
      historialZep,
    );

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    try {
      const completion = await this.groqClient!.chat.completions.create(
        {
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          model: IaAnalysisService.REALTIME_MODEL,
          response_format: { type: 'json_object' },
          temperature: 0.1,
        },
        { signal: controller.signal },
      );

      const rawContent = completion.choices[0]?.message?.content ?? '{}';
      const parsed = JSON.parse(rawContent) as Record<string, unknown>;

      const validNiveles: NivelRiesgo[] = ['bajo', 'medio', 'alto', 'critico'];
      const nivelRiesgo = parsed.nivel_riesgo as NivelRiesgo;

      if (
        !nivelRiesgo ||
        !validNiveles.includes(nivelRiesgo) ||
        typeof parsed.diagnostico_tecnico !== 'string' ||
        typeof parsed.accion_mitigacion !== 'string'
      ) {
        throw new Error(
          `Respuesta Groq con estructura inválida: ${rawContent.substring(0, 200)}`,
        );
      }

      return {
        nivel_riesgo: nivelRiesgo,
        diagnostico_tecnico: parsed.diagnostico_tecnico as string,
        accion_mitigacion: parsed.accion_mitigacion as string,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private buildSystemPromptTiempoReal(): string {
    return [
      'Eres un sistema experto de análisis de riesgo para cadena de frío en transporte de mercancías perecederas.',
      '',
      'REGLA ABSOLUTA: Responde ÚNICAMENTE con un objeto JSON válido. Sin texto adicional, sin explicaciones fuera del JSON, sin markdown.',
      '',
      'El JSON DEBE tener exactamente estas tres llaves:',
      '  "nivel_riesgo": uno de "bajo", "medio", "alto", "critico"',
      '  "diagnostico_tecnico": análisis técnico conciso de la situación',
      '  "accion_mitigacion": acción concreta recomendada',
      '',
      'Criterios de evaluación de riesgo:',
      '  "critico": Temperatura excede el límite máximo por ≥4°C o está ≥4°C por debajo del mínimo, batería ≤10%, o múltiples anomalías graves simultáneas.',
      '  "alto": Temperatura fuera de rango permitido, batería ≤25%, o patrón de anomalía persistente en el historial.',
      '  "medio": Temperatura dentro de 2°C del límite, tendencia de deterioro, o batería ≤40%.',
      '  "bajo": Todos los parámetros dentro de rangos normales y estables.',
      '',
      'Considera el tipo de producto, su valor comercial y el historial de anomalías previas para contextualizar tu diagnóstico.',
    ].join('\n');
  }

  private buildUserPromptTiempoReal(
    viajeMeta: ViajeMetadata,
    telemetria: TelemetriaInput,
    historialZep: string,
  ): string {
    const temp =
      typeof telemetria.temp === 'string'
        ? parseFloat(telemetria.temp)
        : telemetria.temp;

    const lines = [
      '=== DATOS DEL VIAJE ===',
      `Producto: ${viajeMeta.tipo_producto}`,
      `Valor comercial: $${viajeMeta.valor_comercial}`,
      `Rango de temperatura permitido: ${viajeMeta.limite_min_temp}°C – ${viajeMeta.limite_max_temp}°C`,
      '',
      '=== TELEMETRÍA ACTUAL ===',
      `Temperatura: ${temp}°C`,
      `Humedad: ${telemetria.humedad ?? 'N/A'}%`,
      `Batería: ${telemetria.bateria ?? 'N/A'}%`,
      `Ubicación: (${telemetria.lat}, ${telemetria.lon})`,
      `Timestamp sensor: ${telemetria.timestamp_sensor}`,
    ];

    if (historialZep) {
      lines.push('', '=== CONTEXTO DEL GRAFO GLOBAL (ANOMALÍAS HISTÓRICAS) ===', historialZep);
    }

    return lines.join('\n');
  }

  // ── Reglas Deterministas (Fallback / Circuit Breaker) ───────────

  private evaluarReglasDuras(
    viajeMeta: ViajeMetadata,
    telemetria: TelemetriaInput,
  ): {
    nivel_riesgo: NivelRiesgo;
    diagnostico_tecnico: string;
    accion_mitigacion: string;
  } {
    const temp =
      typeof telemetria.temp === 'string'
        ? parseFloat(telemetria.temp)
        : telemetria.temp;
    const bateria = telemetria.bateria ?? 100;
    const limiteMax = viajeMeta.limite_max_temp;
    const limiteMin = viajeMeta.limite_min_temp;

    const excesoMax = temp - limiteMax;
    const excesoMin = limiteMin - temp;
    const fueraDeRango = temp > limiteMax || temp < limiteMin;
    const cercaDelLimite = temp >= limiteMax - 2 || temp <= limiteMin + 2;

    let nivel_riesgo: NivelRiesgo;
    let diagnostico_tecnico: string;
    let accion_mitigacion: string;

    if (excesoMax >= 4 || excesoMin >= 4 || bateria <= 10) {
      nivel_riesgo = 'critico';
      diagnostico_tecnico = `CRÍTICO: Temp ${temp}°C (rango: ${limiteMin}–${limiteMax}°C). Batería: ${bateria}%. Producto: ${viajeMeta.tipo_producto}.`;
      accion_mitigacion =
        'Detener el viaje de inmediato. Inspeccionar cadena de frío y validar estado del equipo manualmente.';
    } else if (fueraDeRango || bateria <= 25) {
      nivel_riesgo = 'alto';
      diagnostico_tecnico = `ALTO: Temp ${temp}°C fuera de rango (${limiteMin}–${limiteMax}°C). Batería: ${bateria}%. Producto: ${viajeMeta.tipo_producto}.`;
      accion_mitigacion =
        'Notificar al operador. Verificar equipo de refrigeración y confirmar ruta actual.';
    } else if (cercaDelLimite || bateria <= 40) {
      nivel_riesgo = 'medio';
      diagnostico_tecnico = `PRECAUCIÓN: Temp ${temp}°C cercana al límite (${limiteMin}–${limiteMax}°C). Batería: ${bateria}%. Producto: ${viajeMeta.tipo_producto}.`;
      accion_mitigacion =
        'Incrementar frecuencia de monitoreo. Preparar alerta preventiva.';
    } else {
      nivel_riesgo = 'bajo';
      diagnostico_tecnico = `NORMAL: Temp ${temp}°C dentro de rango (${limiteMin}–${limiteMax}°C). Batería: ${bateria}%. Producto: ${viajeMeta.tipo_producto}.`;
      accion_mitigacion = 'Continuar monitoreo estándar.';
    }

    return { nivel_riesgo, diagnostico_tecnico, accion_mitigacion };
  }

  // ── Metadata de Viaje (para tiempo real) ────────────────────────

  private async loadViajeMetadata(viajeId: string): Promise<ViajeMetadata> {
    const result = await this.db.query<{
      tipo_producto: string | null;
      valor_comercial: number | null;
      limite_max_temp: number;
      limite_min_temp: number | null;
    }>(
      'SELECT tipo_producto, valor_comercial, limite_max_temp, limite_min_temp FROM viaje WHERE id = $1',
      [viajeId],
    );

    const viaje = result.rows[0];
    if (!viaje) {
      throw new Error(`Viaje ${viajeId} no encontrado para análisis de IA`);
    }

    return {
      tipo_producto: viaje.tipo_producto ?? 'No especificado',
      valor_comercial: viaje.valor_comercial ?? 0,
      limite_max_temp: viaje.limite_max_temp,
      limite_min_temp: viaje.limite_min_temp ?? -50,
    };
  }

  // ── Persistencia en PostgreSQL ──────────────────────────────────

  private async persistirAnalisis(data: {
    viaje_id: string;
    telemetria_id: number;
    nivel_riesgo: NivelRiesgo;
    diagnostico_tecnico: string;
    accion_mitigacion: string;
    fuente: FuenteAnalisis;
  }): Promise<AnalisisIaResultado> {
    const versionModelo =
      data.fuente === 'groq_llm'
        ? IaAnalysisService.REALTIME_MODEL
        : 'reglas_deterministas_v1';

    const result = await this.db.query<AnalisisIaRow>(
      `INSERT INTO analisis_ia
         (viaje_id, telemetria_id, nivel_riesgo, diagnostico_tecnico, accion_mitigacion, fuente, version_modelo)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, viaje_id, telemetria_id, nivel_riesgo, diagnostico_tecnico,
                 accion_mitigacion, fuente, version_modelo, created_at`,
      [
        data.viaje_id,
        data.telemetria_id,
        data.nivel_riesgo,
        data.diagnostico_tecnico,
        data.accion_mitigacion,
        data.fuente,
        versionModelo,
      ],
    );

    return result.rows[0] as unknown as AnalisisIaResultado;
  }

  /**
   * Obtiene las relaciones e historial semántico desde el Grafo Global de Zep.
   */
  async obtenerContextoGrafo(viajeId: string, query: string) {
    return this.zepMemory.recuperarContextoGlobal(viajeId, query);
  }
}
