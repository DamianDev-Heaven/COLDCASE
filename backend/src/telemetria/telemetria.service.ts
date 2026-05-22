import { Injectable, NotFoundException } from '@nestjs/common';
import { DbService } from '../db/db.service';
import { IncidenteService } from '../incidente/incidente.service';

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
    return this.db.transaction(async (client) => {
      const viajeResult = await client.query<{
        id: string;
        limite_max_temp: number;
      }>(
        'SELECT id, limite_max_temp FROM viaje WHERE id = $1',
        [payload.viaje_id],
      );

      const viaje = viajeResult.rows[0];
      if (!viaje) {
        throw new NotFoundException(
          'Viaje no encontrado para registrar telemetria.',
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
          payload.bateria ?? null,
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
      if (payload.temp > viaje.limite_max_temp) {
        incidente = await this.incidenteService.create({
          viaje_id: payload.viaje_id,
          telemetria_id: telemetria.id,
          tipo_alerta: 'TEMP_ALTA',
          valor_detectado: payload.temp,
          umbral_permitido: viaje.limite_max_temp,
          query: client.query.bind(client),
        });
      }

      return {
        ...telemetria,
        incidente_id: incidente?.id ?? null,
        tipo_alerta: incidente?.tipo_alerta ?? null,
        valor_detectado: incidente?.valor_detectado ?? null,
        umbral_permitido: incidente?.umbral_permitido ?? null,
        timestamp_bd: incidente?.timestamp_bd ?? null,
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
    const result = await this.db.query<TelemetriaRow>(
      'SELECT id, viaje_id, lat, lon, temp, humedad, bateria, timestamp_sensor, received_at FROM telemetria WHERE viaje_id = $1 ORDER BY received_at ASC, id ASC',
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