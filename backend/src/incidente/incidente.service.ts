import { Injectable, NotFoundException } from '@nestjs/common';
import { QueryResultRow } from 'pg';
import { DbService } from '../db/db.service';

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

@Injectable()
export class IncidenteService {
  constructor(private readonly db: DbService) {}

  async create(payload: {
    viaje_id: string;
    telemetria_id: number;
    tipo_alerta: 'TEMP_ALTA' | 'FUERA_RUTA' | 'BATERIA_BAJA';
    valor_detectado: number;
    umbral_permitido: number;
    valor_pico?: number;
    timestamp_fin?: string;
    resuelta?: boolean;
    query?: (
      text: string,
      params?: Array<unknown>,
    ) => Promise<{ rows: QueryResultRow[] }>;
  }): Promise<IncidenteRow> {
    const query: (
      text: string,
      params?: Array<unknown>,
    ) => Promise<{ rows: QueryResultRow[] }> =
      payload.query ??
      (this.db.query.bind(this.db) as (
        text: string,
        params?: Array<unknown>,
      ) => Promise<{ rows: QueryResultRow[] }>);
    const result = (await query(
      'INSERT INTO incidente (viaje_id, telemetria_id, tipo_alerta, valor_detectado, umbral_permitido, timestamp_bd, valor_pico, timestamp_fin, resuelta) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, $6, $7, $8) RETURNING id, viaje_id, telemetria_id, tipo_alerta, valor_detectado, umbral_permitido, timestamp_bd, valor_pico, timestamp_fin, resuelta',
      [
        payload.viaje_id,
        payload.telemetria_id,
        payload.tipo_alerta,
        payload.valor_detectado,
        payload.umbral_permitido,
        payload.valor_pico ?? null,
        payload.timestamp_fin ?? null,
        payload.resuelta ?? false,
      ],
    )) as { rows: IncidenteRow[] };

    return result.rows[0];
  }

  async findAll() {
    const result = await this.db.query<IncidenteRow>(
      `SELECT i.id, i.viaje_id, i.telemetria_id, i.tipo_alerta, i.valor_detectado, i.umbral_permitido, i.timestamp_bd,
              COALESCE((SELECT MAX(valor_registrado) FROM incidente_evento WHERE incidente_id = i.id AND tipo_evento = 'PICO_ACTUALIZADO'), i.valor_pico, i.valor_detectado) AS valor_pico,
              (SELECT timestamp_evento FROM incidente_evento WHERE incidente_id = i.id AND tipo_evento = 'RESUELTO' ORDER BY timestamp_evento DESC LIMIT 1) AS timestamp_fin,
              COALESCE((SELECT TRUE FROM incidente_evento WHERE incidente_id = i.id AND tipo_evento = 'RESUELTO' LIMIT 1), FALSE) AS resuelta,
              CASE 
                WHEN EXISTS (SELECT 1 FROM incidente_evento WHERE incidente_id = i.id AND tipo_evento = 'RESUELTO') THEN 'resuelta'
                WHEN i.tipo_alerta = 'TEMP_ALTA' AND (SELECT temp FROM telemetria WHERE viaje_id = i.viaje_id ORDER BY timestamp_sensor DESC, id DESC LIMIT 1) <= i.umbral_permitido THEN 'resolviendo'
                ELSE 'activa'
              END AS estado
       FROM incidente i
       ORDER BY i.timestamp_bd DESC, i.id DESC`,
    );

    return result.rows;
  }

  async findByViaje(viajeId: string) {
    const result = await this.db.query<IncidenteRow>(
      `SELECT i.id, i.viaje_id, i.telemetria_id, i.tipo_alerta, i.valor_detectado, i.umbral_permitido, i.timestamp_bd,
              COALESCE((SELECT MAX(valor_registrado) FROM incidente_evento WHERE incidente_id = i.id AND tipo_evento = 'PICO_ACTUALIZADO'), i.valor_pico, i.valor_detectado) AS valor_pico,
              (SELECT timestamp_evento FROM incidente_evento WHERE incidente_id = i.id AND tipo_evento = 'RESUELTO' ORDER BY timestamp_evento DESC LIMIT 1) AS timestamp_fin,
              COALESCE((SELECT TRUE FROM incidente_evento WHERE incidente_id = i.id AND tipo_evento = 'RESUELTO' LIMIT 1), FALSE) AS resuelta,
              CASE 
                WHEN EXISTS (SELECT 1 FROM incidente_evento WHERE incidente_id = i.id AND tipo_evento = 'RESUELTO') THEN 'resuelta'
                WHEN i.tipo_alerta = 'TEMP_ALTA' AND (SELECT temp FROM telemetria WHERE viaje_id = i.viaje_id ORDER BY timestamp_sensor DESC, id DESC LIMIT 1) <= i.umbral_permitido THEN 'resolviendo'
                ELSE 'activa'
              END AS estado
       FROM incidente i
       WHERE i.viaje_id = $1
       ORDER BY i.timestamp_bd DESC, i.id DESC`,
      [viajeId],
    );

    return result.rows;
  }

  async findOne(id: string) {
    const result = await this.db.query<IncidenteRow>(
      `SELECT i.id, i.viaje_id, i.telemetria_id, i.tipo_alerta, i.valor_detectado, i.umbral_permitido, i.timestamp_bd,
              COALESCE((SELECT MAX(valor_registrado) FROM incidente_evento WHERE incidente_id = i.id AND tipo_evento = 'PICO_ACTUALIZADO'), i.valor_pico, i.valor_detectado) AS valor_pico,
              (SELECT timestamp_evento FROM incidente_evento WHERE incidente_id = i.id AND tipo_evento = 'RESUELTO' ORDER BY timestamp_evento DESC LIMIT 1) AS timestamp_fin,
              COALESCE((SELECT TRUE FROM incidente_evento WHERE incidente_id = i.id AND tipo_evento = 'RESUELTO' LIMIT 1), FALSE) AS resuelta,
              CASE 
                WHEN EXISTS (SELECT 1 FROM incidente_evento WHERE incidente_id = i.id AND tipo_evento = 'RESUELTO') THEN 'resuelta'
                WHEN i.tipo_alerta = 'TEMP_ALTA' AND (SELECT temp FROM telemetria WHERE viaje_id = i.viaje_id ORDER BY timestamp_sensor DESC, id DESC LIMIT 1) <= i.umbral_permitido THEN 'resolviendo'
                ELSE 'activa'
              END AS estado
       FROM incidente i
       WHERE i.id = $1`,
      [id],
    );

    const incidente = result.rows[0];
    if (!incidente) {
      throw new NotFoundException('Incidente no encontrado.');
    }

    return incidente;
  }
}
