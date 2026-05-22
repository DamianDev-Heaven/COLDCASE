import { Injectable } from '@nestjs/common';
import { DbService } from '../db/db.service';

@Injectable()
export class IotService {
  constructor(private readonly db: DbService) {}

  async create(payload: {
    tipo_dispositivo: string;
    estado_conexion: string;
    ultimo_ping: string;
    firmware_version?: string;
  }) {
    const result = await this.db.query(
      'INSERT INTO iot (tipo_dispositivo, estado_conexion, ultimo_ping, firmware_version) VALUES ($1, $2, $3, $4) RETURNING id, tipo_dispositivo, estado_conexion, ultimo_ping, firmware_version',
      [
        payload.tipo_dispositivo,
        payload.estado_conexion,
        payload.ultimo_ping,
        payload.firmware_version ?? null,
      ],
    );

    return result.rows[0];
  }

  async findAll() {
    const result = await this.db.query(
      'SELECT id, tipo_dispositivo, estado_conexion, ultimo_ping, firmware_version FROM iot ORDER BY ultimo_ping DESC',
    );

    return result.rows;
  }
}
