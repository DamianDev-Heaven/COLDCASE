import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { DbService } from '../db/db.service';
import { CreatePerfilProductoDto } from './dto/create-perfil-producto.dto';
import { UpdatePerfilProductoDto } from './dto/update-perfil-producto.dto';

export interface PerfilProducto {
  id: string;
  nombre: string;
  limite_min_temp: number;
  limite_max_temp: number;
  limite_min_humedad: number;
  limite_max_humedad: number;
}

@Injectable()
export class PerfilProductoService {
  constructor(private readonly db: DbService) {}

  async create(dto: CreatePerfilProductoDto): Promise<PerfilProducto> {
    // Check if ID already exists
    const existing = await this.db.query<{ id: string }>(
      'SELECT id FROM perfil_producto WHERE id = $1',
      [dto.id.toLowerCase().trim()],
    );

    if (existing.rowCount && existing.rowCount > 0) {
      throw new BadRequestException(
        `El perfil de producto con ID "${dto.id}" ya existe.`,
      );
    }

    const result = await this.db.query<PerfilProducto>(
      'INSERT INTO perfil_producto (id, nombre, limite_min_temp, limite_max_temp, limite_min_humedad, limite_max_humedad) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, nombre, limite_min_temp, limite_max_temp, limite_min_humedad, limite_max_humedad',
      [
        dto.id.toLowerCase().trim(),
        dto.nombre,
        dto.limite_min_temp,
        dto.limite_max_temp,
        dto.limite_min_humedad,
        dto.limite_max_humedad,
      ],
    );

    return result.rows[0];
  }

  async findAll(): Promise<PerfilProducto[]> {
    const result = await this.db.query<PerfilProducto>(
      'SELECT id, nombre, limite_min_temp, limite_max_temp, limite_min_humedad, limite_max_humedad FROM perfil_producto ORDER BY nombre ASC',
    );
    return result.rows;
  }

  async findOne(id: string): Promise<PerfilProducto> {
    const result = await this.db.query<PerfilProducto>(
      'SELECT id, nombre, limite_min_temp, limite_max_temp, limite_min_humedad, limite_max_humedad FROM perfil_producto WHERE id = $1',
      [id],
    );

    if (!result.rowCount || result.rowCount === 0) {
      throw new NotFoundException(
        `El perfil de producto con ID "${id}" no existe.`,
      );
    }

    return result.rows[0];
  }

  async update(
    id: string,
    dto: UpdatePerfilProductoDto,
  ): Promise<PerfilProducto> {
    // Check if profile exists
    await this.findOne(id);

    const updates: string[] = [];
    const values: any[] = [];

    if (dto.nombre !== undefined) {
      values.push(dto.nombre);
      updates.push(`nombre = $${values.length}`);
    }

    if (dto.limite_min_temp !== undefined) {
      values.push(dto.limite_min_temp);
      updates.push(`limite_min_temp = $${values.length}`);
    }

    if (dto.limite_max_temp !== undefined) {
      values.push(dto.limite_max_temp);
      updates.push(`limite_max_temp = $${values.length}`);
    }

    if (dto.limite_min_humedad !== undefined) {
      values.push(dto.limite_min_humedad);
      updates.push(`limite_min_humedad = $${values.length}`);
    }

    if (dto.limite_max_humedad !== undefined) {
      values.push(dto.limite_max_humedad);
      updates.push(`limite_max_humedad = $${values.length}`);
    }

    if (updates.length === 0) {
      throw new BadRequestException(
        'Debes enviar al menos un campo para actualizar.',
      );
    }

    values.push(id);
    const result = await this.db.query<PerfilProducto>(
      `UPDATE perfil_producto SET ${updates.join(', ')} WHERE id = $${values.length} RETURNING id, nombre, limite_min_temp, limite_max_temp, limite_min_humedad, limite_max_humedad`,
      values,
    );

    return result.rows[0];
  }

  async delete(id: string): Promise<{ deleted: boolean; id: string }> {
    // Check if exists
    await this.findOne(id);

    // Delete it. Note: viaje.perfil_producto_id constraint has ON DELETE SET NULL,
    // so it is safe to delete and will not fail even if there are associated viajes.
    await this.db.query('DELETE FROM perfil_producto WHERE id = $1', [id]);

    return { deleted: true, id };
  }
}
