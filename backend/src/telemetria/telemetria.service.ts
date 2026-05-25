import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DbService } from '../db/db.service';
import { IncidenteService } from '../incidente/incidente.service';
import { IaAnalysisService } from '../ia/ia-analysis.service';

interface WaypointGeoJSON {
  features?: Array<{
    geometry?: {
      coordinates?: Array<[number, number]>;
    };
  }>;
}

interface WaypointPoint {
  lat?: number;
  lon?: number;
  latitude?: number;
  longitude?: number;
}

type IncidenteRow = {
  id: string;
  viaje_id: string;
  telemetria_id: number;
  tipo_alerta: 'TEMP_ALTA' | 'FUERA_RUTA' | 'BATERIA_BAJA';
  valor_detectado: number;
  umbral_permitido: number;
  timestamp_bd: string;
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
    const result = await this.db.transaction(async (client) => {
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

      let incidente: any = null;
      let encolarIa = false;
      let incidenteParaIa: any = null;

      // 2. Consultar Excursión Activa (TEMP_ALTA)
      const activeIncidentResult = await client.query<any>(
        "SELECT id, viaje_id, telemetria_id, tipo_alerta, valor_detectado, umbral_permitido, timestamp_bd, valor_pico, resuelta FROM incidente WHERE viaje_id = $1 AND tipo_alerta = 'TEMP_ALTA' AND resuelta = false LIMIT 1",
        [payload.viaje_id],
      );
      const activeIncident = activeIncidentResult.rows[0];

      const tempAlta = payload.temp > viaje.limite_max_temp;

      if (tempAlta) {
        // MÁQUINA DE ESTADOS: Temperatura ALTA
        if (!activeIncident) {
          // Caso Alta + No Activa: Crear incidente abierto
          incidente = await this.incidenteService.create({
            viaje_id: payload.viaje_id,
            telemetria_id: telemetria.id,
            tipo_alerta: 'TEMP_ALTA',
            valor_detectado: payload.temp,
            umbral_permitido: viaje.limite_max_temp,
            valor_pico: payload.temp,
            resuelta: false,
            query: (text, params) => client.query(text, params),
          });
        } else {
          // Caso Alta + Activa: Actualizar valor_pico si la nueva lectura es mayor
          const currentPico = activeIncident.valor_pico != null ? Number(activeIncident.valor_pico) : Number(activeIncident.valor_detectado);
          if (payload.temp > currentPico) {
            await client.query(
              'UPDATE incidente SET valor_pico = $1 WHERE id = $2',
              [payload.temp, activeIncident.id],
            );
            activeIncident.valor_pico = payload.temp;
          }
          incidente = activeIncident;
        }
      } else {
        // MÁQUINA DE ESTADOS: Temperatura NORMAL
        if (activeIncident) {
          // Caso Normal + Activa (Histéresis): consultar los últimos 3 pings para el viaje
          const lastPingsResult = await client.query<{ temp: number }>(
            'SELECT temp FROM telemetria WHERE viaje_id = $1 ORDER BY timestamp_sensor DESC, id DESC LIMIT 3',
            [payload.viaje_id],
          );
          const lastPings = lastPingsResult.rows;

          // Si hay al menos 3 pings y todos son normales (<= limite_max_temp)
          const gracePeriodMet = lastPings.length >= 3 && lastPings.every(p => Number(p.temp) <= viaje.limite_max_temp);

          if (gracePeriodMet) {
            // Resolver excursión activa
            const updateResult = await client.query<any>(
              "UPDATE incidente SET resuelta = true, timestamp_fin = NOW() WHERE id = $1 RETURNING id, viaje_id, telemetria_id, tipo_alerta, valor_detectado, umbral_permitido, timestamp_bd, timestamp_fin, valor_pico, resuelta",
              [activeIncident.id],
            );
            const resolvedIncidente = updateResult.rows[0];
            incidente = resolvedIncidente;

            // Marcar para encolar en BullMQ después de completar la transacción
            encolarIa = true;
            incidenteParaIa = resolvedIncidente;
          } else {
            incidente = activeIncident;
          }
        } else {
          // Caso Normal + No Activa (Fast-Path):
          // Solo evaluamos BATERIA_BAJA y FUERA_RUTA si la temperatura es normal y no hay alertas activas de temperatura
          if (payload.bateria != null && Number(payload.bateria) <= 10) {
            incidente = await this.incidenteService.create({
              viaje_id: payload.viaje_id,
              telemetria_id: telemetria.id,
              tipo_alerta: 'BATERIA_BAJA',
              valor_detectado: Math.trunc(Number(payload.bateria)),
              umbral_permitido: 10,
              query: (text, params) => client.query(text, params),
            });
          } else {
            // Detectar si la telemetría está fuera de la ruta
            try {
              const margen =
                viaje.margen_desvio_km == null
                  ? 0.5
                  : Number(viaje.margen_desvio_km);
              const waypoints =
                Array.isArray(viaje.ruta_waypoints) && viaje.ruta_waypoints.length
                  ? (viaje.ruta_waypoints as WaypointPoint[])
                  : ((
                      viaje.ruta_waypoints as WaypointGeoJSON
                    )?.features?.[0]?.geometry?.coordinates?.map(
                      (c: [number, number]) => ({ lon: c[0], lat: c[1] }),
                    ) ?? null);

              if (Array.isArray(waypoints) && waypoints.length > 0 && margen >= 0) {
                let waypointsList = waypoints as Array<
                  WaypointPoint | [number, number]
                >;

                // DOWNSAMPLING UNIFORME: Limitar a máximo 30 puntos distribuidos uniformemente para evitar el Efecto Avalancha
                if (waypointsList.length > 30) {
                  const step = (waypointsList.length - 1) / 29;
                  const downsampled: Array<WaypointPoint | [number, number]> = [];
                  for (let i = 0; i < 30; i++) {
                    const index = Math.round(i * step);
                    downsampled.push(waypointsList[index]);
                  }
                  waypointsList = downsampled;
                }

                // calcular distancia mínima (km) entre telemetría y puntos de la ruta
                const toRad = (deg: number) => (deg * Math.PI) / 180;
                const haversineKm = (
                  aLat: number,
                  aLon: number,
                  bLat: number,
                  bLon: number,
                ) => {
                  const R = 6371; // km
                  const dLat = toRad(bLat - aLat);
                  const dLon = toRad(bLon - aLon);
                  const lat1 = toRad(aLat);
                  const lat2 = toRad(bLat);
                  const sinDlat = Math.sin(dLat / 2);
                  const sinDlon = Math.sin(dLon / 2);
                  const aa =
                    sinDlat * sinDlat +
                    sinDlon * sinDlon * Math.cos(lat1) * Math.cos(lat2);
                  const c = 2 * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
                  return R * c;
                };

                const lat = Number(payload.lat);
                const lon = Number(payload.lon);
                let minKm = Infinity;
                for (const p of waypointsList) {
                  let pLat: number | undefined;
                  let pLon: number | undefined;
                  if (Array.isArray(p)) {
                    pLon = p[0];
                    pLat = p[1];
                  } else if (p && typeof p === 'object') {
                    pLat = p.lat ?? p.latitude;
                    pLon = p.lon ?? p.longitude;
                  }
                  const pl = {
                    lat: Number(pLat),
                    lon: Number(pLon),
                  };
                  if (!Number.isFinite(pl.lat) || !Number.isFinite(pl.lon))
                    continue;
                  const dist = haversineKm(lat, lon, pl.lat, pl.lon);
                  if (dist < minKm) minKm = dist;
                }

                if (minKm > margen) {
                  incidente = await this.incidenteService.create({
                    viaje_id: payload.viaje_id,
                    telemetria_id: telemetria.id,
                    tipo_alerta: 'FUERA_RUTA',
                    valor_detectado: Math.round(minKm * 1000), // metros
                    umbral_permitido: Math.round(margen * 1000),
                    query: (text, params) => client.query(text, params),
                  });
                }
              }
            } catch {
              // no bloquear inserción por fallo en detección de fuera de ruta
            }
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
        encolarIa,
        incidenteParaIa,
      };
    });

    let ia_diagnosis: string | null = null;

    if (result.encolarIa && result.incidenteParaIa) {
      try {
        const inc = result.incidenteParaIa;
        const durationMs = new Date(inc.timestamp_fin).getTime() - new Date(inc.timestamp_bd).getTime();
        const duracionSegundos = Math.max(0, Math.round(durationMs / 1000));

        // Encolar el análisis en BullMQ consolidando la excursión completa
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
      } catch (err: any) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`Error al encolar análisis IA en tiempo real: ${msg}`);
      }
    }

    return {
      ...result,
      ia_diagnosis,
    };
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
}
