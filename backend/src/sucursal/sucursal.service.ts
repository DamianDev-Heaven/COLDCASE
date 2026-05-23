import { Injectable } from '@nestjs/common';
import { DbService } from '../db/db.service';

@Injectable()
export class SucursalService {
  constructor(private readonly db: DbService) {}

  async create(payload: {
    empresa_id: string;
    nombre: string;
    lat: number;
    lon: number;
    direccion?: string;
  }) {
    const result = await this.db.query(
      'INSERT INTO sucursal (empresa_id, nombre, lat, lon, direccion) VALUES ($1, $2, $3, $4, $5) RETURNING id, empresa_id, nombre, lat, lon, direccion',
      [
        payload.empresa_id,
        payload.nombre,
        payload.lat,
        payload.lon,
        payload.direccion ?? null,
      ],
    );

    return result.rows[0];
  }

  async findAll() {
    const result = await this.db.query(
      'SELECT s.id, s.empresa_id, e.nombre AS empresa_nombre, s.nombre, s.lat, s.lon, s.direccion FROM sucursal s INNER JOIN empresa e ON e.id = s.empresa_id ORDER BY e.nombre ASC, s.nombre ASC',
    );

    return result.rows;
  }
}
