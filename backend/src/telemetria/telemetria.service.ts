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

type IncidenteRow = {
  id: string;
  viaje_id: string;
  telemetria_id: number;
  tipo_alerta: 'TEMP_ALTA' | 'FUERA_RUTA' | 'BATERIA_BAJA';
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
    private readonly tempDetector: TemperatureAnomalyDetector,
    private readonly batteryDetector: BatteryAnomalyDetector,
    private readonly routeDetector: RouteDeviationDetector,
  ) {}

  async create(payload: {
    viaje_id: string;
    lat: number;
    lon: number;
    temp: number;
    humedad?: number;
    bateria?: number;
    timestamp_sensor: string;
  }) {
    try {
      const result = await this.createDirect(payload);

      // Encolar análisis de IA si se detectó la resolución de una excursión térmica
      let ia_diagnosis: string | null = null;
      if (result.encolarIa && result.incidenteParaIa) {
        try {
          const inc = result.incidenteParaIa;
          const durationMs =
            new Date(inc.timestamp_fin || '').getTime() -
            new Date(inc.timestamp_bd || '').getTime();
          const duracionSegundos = Math.max(0, Math.round(durationMs / 1000));

          await this.iaQueue.add('analyze-incident', {
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
              valor_pico: Number(inc.valor_pico ?? inc.valor_detectado),
              duracion_segundos: duracionSegundos,
              umbral_permitido: Number(inc.umbral_permitido),
            },
          });
          ia_diagnosis = 'Análisis encolado para procesamiento en lote';
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          console.warn(
            `Error al encolar análisis IA en tiempo real: ${errorMsg}`,
          );
        }
      }

      return {
        ...result,
        ia_diagnosis,
      };
    } catch (err) {
      // Si es un error de validación (4xx), propagarlo normalmente
      if (err && typeof err === 'object' && 'status' in err) {
        const status = (err as Record<string, unknown>).status;
        if (typeof status === 'number' && status < 500) {
          throw err;
        }
      }

      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(
        'Fallo de escritura en base de datos. Activando contingencia BullMQ:',
        errorMsg,
      );

      try {
        // Encolar telemetría con ID de trabajo único para de-duplicación
        const jobId = `${payload.viaje_id}-${payload.timestamp_sensor}`;
        await this.contingencyQueue.add('process-contingency', payload, {
          jobId,
          attempts: 20,
          backoff: {
            type: 'exponential',
            delay: 10000,
          },
        });

        return {
          contingency: true,
          message:
            'Telemetría guardada en cola de contingencia temporal por fallo en base de datos.',
          id: -1,
          viaje_id: payload.viaje_id,
          lat: String(payload.lat),
          lon: String(payload.lon),
          temp: String(payload.temp),
          humedad: payload.humedad ?? null,
          bateria: payload.bateria == null ? null : Math.trunc(payload.bateria),
          timestamp_sensor: payload.timestamp_sensor,
          received_at: new Date().toISOString(),
          incidente_id: null,
          tipo_alerta: null,
          valor_detectado: null,
          umbral_permitido: null,
          timestamp_bd: null,
          ia_diagnosis: 'En espera de restablecimiento de base de datos',
        };
      } catch (redisErr) {
        const redisMsg =
          redisErr instanceof Error ? redisErr.message : String(redisErr);
        console.error(
          'Error crítico: Redis también falló al guardar en contingencia:',
          redisMsg,
        );
        throw err;
      }
    }
  }

  async createDirect(payload: {
    viaje_id: string;
    lat: number;
    lon: number;
    temp: number;
    humedad?: number;
    bateria?: number;
    timestamp_sensor: string;
  }) {
    return await this.db.transaction(async (client) => {
      // 1. Validar que el viaje exista y esté 'en_curso'
      const viajeResult = await client.query<{
        id: string;
        limite_max_temp: number;
        ruta_waypoints?: unknown;
        margen_desvio_km?: number;
        estado: string;
      }>(
        'SELECT id, limite_max_temp, ruta_waypoints, margen_desvio_km, estado FROM viaje WHERE id = $1',
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
        timestamp_sensor: string;
        received_at: string;
      }>(
        'INSERT INTO telemetria (viaje_id, lat, lon, temp, humedad, bateria, timestamp_sensor) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, viaje_id, lat, lon, temp, humedad, bateria, timestamp_sensor, received_at',
        [
          payload.viaje_id,
          payload.lat,
          payload.lon,
          payload.temp,
          payload.humedad ?? null,
          payload.bateria == null ? null : Math.trunc(payload.bateria),
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
      let encolarIa = false;
      let incidenteParaIa: IncidenteRow | null = null;

      // 3. Evaluar anomalías usando detectores en cadena de responsabilidad
      const detectors = [
        this.tempDetector,
        this.batteryDetector,
        this.routeDetector,
      ];
      for (const detector of detectors) {
        const result = await detector.evaluate(
          payload,
          telemetria.id,
          viaje,
          client,
        );
        if (result && result.incidente) {
          incidente = result.incidente as IncidenteRow;
          if (result.encolarIa) {
            encolarIa = true;
          }
          if (result.incidenteParaIa) {
            incidenteParaIa = result.incidenteParaIa as IncidenteRow;
          }
          break;
        }
      }

      return {
        ...telemetria,
        incidente_id: incidente?.id ?? null,
        tipo_alerta: incidente?.tipo_alerta ?? null,
        valor_detectado: incidente?.valor_detectado ?? null,
        umbral_permitido: incidente?.umbral_permitido ?? null,
        timestamp_bd: incidente?.timestamp_bd ?? null,
        encolarIa,
        incidenteParaIa,
      };
    });
  }

  async findAll() {
    const result = await this.db.query<TelemetriaRow>(
      'SELECT id, viaje_id, lat, lon, temp, humedad, bateria, timestamp_sensor, received_at FROM telemetria ORDER BY received_at DESC, id DESC',
    );

    return result.rows;
  }

  async findByViaje(viajeId: string) {
    const result = await this.db.query<
      TelemetriaRow & { ia_diagnosis?: string }
    >(
      `SELECT t.id, t.viaje_id, t.lat, t.lon, t.temp, t.humedad, t.bateria, t.timestamp_sensor, t.received_at, a.diagnostico_tecnico AS ia_diagnosis
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
      'SELECT id, viaje_id, lat, lon, temp, humedad, bateria, timestamp_sensor, received_at FROM telemetria WHERE id = $1',
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
