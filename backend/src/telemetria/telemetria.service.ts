import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DbService } from '../db/db.service';
import { IncidenteService } from '../incidente/incidente.service';
import { IaAnalysisService } from '../ia/ia-analysis.service';
import { TemperatureAnomalyDetector } from './detectors/temperature-anomaly.detector';
import { BatteryAnomalyDetector } from './detectors/battery-anomaly.detector';
import { RouteDeviationDetector } from './detectors/route-deviation.detector';
import { HumidityAnomalyDetector } from './detectors/humidity-anomaly.detector';
import { MktAnomalyDetector } from './detectors/mkt-anomaly.detector';
import { GateSecurityDetector } from './detectors/gate-security.detector';

type IncidenteRow = {
  id: string;
  viaje_id: string;
  telemetria_id: number;
  tipo_alerta:
    | 'TEMP_ALTA'
    | 'FUERA_RUTA'
    | 'BATERIA_BAJA'
    | 'BATERIA_AGOTADA'
    | 'HUMEDAD_FUERA_RANGO'
    | 'MKT_EXCEDIDO'
    | 'APERTURA_NO_AUTORIZADA';
  valor_detectado: number;
  umbral_permitido: number;
  timestamp_bd: string;
  timestamp_fin?: string | null;
  valor_pico?: number | null;
  resuelta?: boolean;
};

type TelemetriaRow = {
  id: number;
  viaje_id: string;
  lat: string;
  lon: string;
  temp: string;
  humedad: number | null;
  bateria: number | null;
  compuerta_abierta: boolean;
  timestamp_sensor: string;
  received_at: string;
};

@Injectable()
export class TelemetriaService {
  constructor(
    private readonly db: DbService,
    private readonly incidenteService: IncidenteService,
    private readonly iaAnalysisService: IaAnalysisService,
    @InjectQueue('ia-analysis-queue') private readonly iaQueue: Queue,
    @InjectQueue('telemetria-contingency-queue')
    private readonly contingencyQueue: Queue,
    @InjectQueue('telemetria-ingest-queue')
    private readonly ingestQueue: Queue,
    private readonly tempDetector: TemperatureAnomalyDetector,
    private readonly batteryDetector: BatteryAnomalyDetector,
    private readonly routeDetector: RouteDeviationDetector,
    private readonly humidityDetector: HumidityAnomalyDetector,
    private readonly mktDetector: MktAnomalyDetector,
    private readonly gateSecurityDetector: GateSecurityDetector,
  ) {}

  async create(payload: {
    viaje_id: string;
    lat: number;
    lon: number;
    temp: number;
    humedad?: number;
    bateria?: number;
    compuerta_abierta?: boolean;
    timestamp_sensor: string;
  }) {
    // Generar ID único por mensaje para garantizar de-duplicación
    const jobId = `${payload.viaje_id}-${payload.timestamp_sensor}`;

    try {
      // Registrar telemetría encolándola en Redis
      await this.ingestQueue.add('process-ingest', payload, {
        jobId,
        attempts: 10,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: true, // Limpiar trabajos completados
        removeOnFail: false, // Mantener fallidos para inspección SRE (Dead Letter Queue)
      });

      return {
        status: 'accepted',
        message:
          'Telemetría encolada exitosamente para procesamiento asíncrono.',
        jobId,
        viaje_id: payload.viaje_id,
        timestamp_sensor: payload.timestamp_sensor,
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(
        'Error al encolar telemetría en telemetria-ingest-queue:',
        errorMsg,
      );
      throw new BadRequestException(
        'Fallo crítico: No se pudo encolar la telemetría en el búfer temporal.',
      );
    }
  }

  async enqueueIaAnalysis(
    result: TelemetriaRow & { incidenteParaIa?: IncidenteRow | null },
    payload: { viaje_id: string },
  ) {
    try {
      const inc = result.incidenteParaIa;
      if (!inc) return;

      const durationMs =
        new Date(inc.timestamp_fin || '').getTime() -
        new Date(inc.timestamp_bd || '').getTime();
      const duracionSegundos = Math.max(0, Math.round(durationMs / 1000));

      await this.iaQueue.add(
        'analyze-incident',
        {
          viajeId: payload.viaje_id,
          incidenteData: {
            id: result.id,
            viaje_id: payload.viaje_id,
            lat: Number(result.lat),
            lon: Number(result.lon),
            temp: Number(result.temp),
            humedad: result.humedad,
            bateria: result.bateria,
            timestamp_sensor: result.timestamp_sensor,
            incidente_id: inc.id,
            tipo_alerta: inc.tipo_alerta,
            valor_pico: Number(inc.valor_pico ?? inc.valor_detectado),
            duracion_segundos: duracionSegundos,
            umbral_permitido: Number(inc.umbral_permitido),
          },
        },
        {
          attempts: 5,
          backoff: {
            type: 'exponential',
            delay: 5000,
          },
          removeOnComplete: 100, // Conservar últimos 100 para que el dashboard muestre contadores reales
          removeOnFail: false, // DLQ para inspección manual SRE de fallos de IA
        },
      );
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.warn(
        `Error al encolar análisis IA en segundo plano: ${errorMsg}`,
      );
    }
  }

  async createDirect(payload: {
    viaje_id: string;
    lat: number;
    lon: number;
    temp: number;
    humedad?: number;
    bateria?: number;
    compuerta_abierta?: boolean;
    timestamp_sensor: string;
  }) {
    return await this.db.transaction(async (client) => {
      // 1. Validar que el viaje exista y esté 'en_curso'
      const viajeResult = await client.query<{
        id: string;
        limite_max_temp: number;
        limite_min_humedad?: number | null;
        limite_max_humedad?: number | null;
        sucursal_origen_id?: string | null;
        sucursal_destino_id?: string | null;
        ruta_waypoints?: unknown;
        margen_desvio_km?: number;
        estado: string;
      }>(
        'SELECT id, limite_max_temp, limite_min_humedad, limite_max_humedad, sucursal_origen_id, sucursal_destino_id, ruta_waypoints, margen_desvio_km, estado FROM viaje WHERE id = $1',
        [payload.viaje_id],
      );

      const viaje = viajeResult.rows[0];
      if (!viaje) {
        throw new NotFoundException(
          'Viaje no encontrado para registrar telemetria.',
        );
      }

      if (viaje.estado !== 'en_curso') {
        throw new BadRequestException(
          `El viaje no está en curso para recibir telemetría (estado actual: ${viaje.estado}).`,
        );
      }

      // 2. Insertar Telemetría
      const telemetriaResult = await client.query<{
        id: number;
        viaje_id: string;
        lat: string;
        lon: string;
        temp: string;
        humedad: number | null;
        bateria: number | null;
        compuerta_abierta: boolean;
        timestamp_sensor: string;
        received_at: string;
      }>(
        'INSERT INTO telemetria (viaje_id, lat, lon, temp, humedad, bateria, compuerta_abierta, timestamp_sensor) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, viaje_id, lat, lon, temp, humedad, bateria, compuerta_abierta, timestamp_sensor, received_at',
        [
          payload.viaje_id,
          payload.lat,
          payload.lon,
          payload.temp,
          payload.humedad ?? null,
          payload.bateria == null ? null : Math.trunc(payload.bateria),
          payload.compuerta_abierta ?? false,
          payload.timestamp_sensor,
        ],
      );

      const telemetria = telemetriaResult.rows[0];
      if (!telemetria) {
        throw new NotFoundException(
          'No se pudo registrar la telemetria del viaje.',
        );
      }

      let incidente: IncidenteRow | null = null;
      const incidentesParaIa: IncidenteRow[] = [];

      // 3. Evaluar anomalías usando detectores en cadena
      const detectors = [
        this.tempDetector,
        this.batteryDetector,
        this.routeDetector,
        this.humidityDetector,
        this.mktDetector,
        this.gateSecurityDetector,
      ];
      for (const detector of detectors) {
        const result = await detector.evaluate(
          payload,
          telemetria.id,
          viaje,
          client,
        );
        if (result && result.incidente) {
          if (!incidente) {
            incidente = result.incidente as IncidenteRow;
          }
          if (result.encolarIa && result.incidenteParaIa) {
            incidentesParaIa.push(result.incidenteParaIa as IncidenteRow);
          }
        }
      }

      return {
        ...telemetria,
        incidente_id: incidente?.id ?? null,
        tipo_alerta: incidente?.tipo_alerta ?? null,
        valor_detectado: incidente?.valor_detectado ?? null,
        umbral_permitido: incidente?.umbral_permitido ?? null,
        timestamp_bd: incidente?.timestamp_bd ?? null,
        incidentesParaIa,
      };
    });
  }

  async findAll() {
    const result = await this.db.query<TelemetriaRow>(
      'SELECT id, viaje_id, lat, lon, temp, humedad, bateria, compuerta_abierta, timestamp_sensor, received_at FROM telemetria ORDER BY received_at DESC, id DESC',
    );

    return result.rows;
  }

  async findByViaje(viajeId: string) {
    const result = await this.db.query<
      TelemetriaRow & { ia_diagnosis?: string }
    >(
      `SELECT t.id, t.viaje_id, t.lat, t.lon, t.temp, t.humedad, t.bateria, t.compuerta_abierta, t.timestamp_sensor, t.received_at, a.diagnostico_tecnico AS ia_diagnosis
       FROM telemetria t
       LEFT JOIN analisis_ia a ON a.telemetria_id = t.id
       WHERE t.viaje_id = $1
       ORDER BY t.received_at ASC, t.id ASC`,
      [viajeId],
    );

    return result.rows;
  }

  async findOne(id: number) {
    const result = await this.db.query<TelemetriaRow>(
      'SELECT id, viaje_id, lat, lon, temp, humedad, bateria, compuerta_abierta, timestamp_sensor, received_at FROM telemetria WHERE id = $1',
      [id],
    );

    const telemetria = result.rows[0];
    if (!telemetria) {
      throw new NotFoundException('Telemetria no encontrada.');
    }

    return telemetria;
  }

  async getContingencyStats() {
    let dbStatus = 'up';
    try {
      await this.db.query('SELECT 1');
    } catch {
      dbStatus = 'down';
    }

    try {
      const counts = await this.contingencyQueue.getJobCounts(
        'wait',
        'active',
        'delayed',
        'failed',
      );
      const size =
        (counts.wait || 0) +
        (counts.active || 0) +
        (counts.delayed || 0) +
        (counts.failed || 0);
      return {
        dbStatus,
        size,
        counts,
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return {
        dbStatus,
        size: 0,
        error: errorMsg,
      };
    }
  }

  async retryContingency() {
    try {
      const failedJobs = await this.contingencyQueue.getJobs(['failed']);
      for (const job of failedJobs) {
        await job.retry();
      }
      return { retriedCount: failedJobs.length };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      return { error: errorMsg };
    }
  }
}
