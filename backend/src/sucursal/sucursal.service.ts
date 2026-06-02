import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { DbService } from '../db/db.service';
import { UpdateSucursalDto } from './dto/update-sucursal.dto';

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

  async findOne(id: string) {
    const result = await this.db.query(
      'SELECT s.id, s.empresa_id, e.nombre AS empresa_nombre, s.nombre, s.lat, s.lon, s.direccion FROM sucursal s INNER JOIN empresa e ON e.id = s.empresa_id WHERE s.id = $1',
      [id],
    );
    const sucursal = result.rows[0];
    if (!sucursal) {
      throw new NotFoundException('Sucursal no encontrada.');
    }
    return sucursal;
  }

  async update(id: string, dto: UpdateSucursalDto) {
    await this.findOne(id);
    const updates: string[] = [];
    const values: any[] = [];

    if (dto.empresa_id !== undefined) {
      values.push(dto.empresa_id);
      updates.push(`empresa_id = $${values.length}`);
    }

    if (dto.nombre !== undefined) {
      values.push(dto.nombre);
      updates.push(`nombre = $${values.length}`);
    }

    if (dto.lat !== undefined) {
      values.push(dto.lat);
      updates.push(`lat = $${values.length}`);
    }

    if (dto.lon !== undefined) {
      values.push(dto.lon);
      updates.push(`lon = $${values.length}`);
    }

    if (dto.direccion !== undefined) {
      values.push(dto.direccion);
      updates.push(`direccion = $${values.length}`);
    }

    if (updates.length === 0) {
      throw new BadRequestException('Debes enviar al menos un campo para actualizar.');
    }

    values.push(id);
    const result = await this.db.query(
      `UPDATE sucursal SET ${updates.join(', ')} WHERE id = $${values.length} RETURNING id, empresa_id, nombre, lat, lon, direccion`,
      values,
    );
    return result.rows[0];
  }

  async delete(id: string) {
    await this.findOne(id);
    await this.db.query('DELETE FROM sucursal WHERE id = $1', [id]);
    return { deleted: true, id };
  }
}
