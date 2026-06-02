import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { DbService } from '../db/db.service';
import { UpdateTransporteDto } from './dto/update-transporte.dto';

@Injectable()
export class TransporteService {
  constructor(private readonly db: DbService) {}

  async create(payload: {
    placa: string;
    iot_id: string;
    empresa_id: string;
    estado: 'Activo' | 'Mantenimiento';
    capacidad?: number;
  }) {
    const result = await this.db.query(
      'INSERT INTO transporte (placa, iot_id, empresa_id, estado, capacidad) VALUES ($1, $2, $3, $4, $5) RETURNING id, placa, iot_id, empresa_id, estado, capacidad',
      [
        payload.placa,
        payload.iot_id,
        payload.empresa_id,
        payload.estado,
        payload.capacidad ?? null,
      ],
    );

    return result.rows[0];
  }

  async findAll() {
    const result = await this.db.query(
      'SELECT t.id, t.placa, t.iot_id, t.empresa_id, e.nombre AS empresa_nombre, t.estado, t.capacidad, t.capacidad AS capacidad_carga_kg FROM transporte t INNER JOIN empresa e ON e.id = t.empresa_id ORDER BY t.created_at DESC, t.ctid DESC',
    );

    return result.rows;
  }

  async findOne(id: string) {
    const result = await this.db.query(
      'SELECT t.id, t.placa, t.iot_id, t.empresa_id, e.nombre AS empresa_nombre, t.estado, t.capacidad, t.capacidad AS capacidad_carga_kg FROM transporte t INNER JOIN empresa e ON e.id = t.empresa_id WHERE t.id = $1',
      [id],
    );
    const transporte = result.rows[0];
    if (!transporte) {
      throw new NotFoundException('Vehículo de transporte no encontrado.');
    }
    return transporte;
  }

  async update(id: string, dto: UpdateTransporteDto) {
    await this.findOne(id);
    const updates: string[] = [];
    const values: any[] = [];

    if (dto.placa !== undefined) {
      values.push(dto.placa);
      updates.push(`placa = $${values.length}`);
    }

    if (dto.iot_id !== undefined) {
      values.push(dto.iot_id);
      updates.push(`iot_id = $${values.length}`);
    }

    if (dto.empresa_id !== undefined) {
      values.push(dto.empresa_id);
      updates.push(`empresa_id = $${values.length}`);
    }

    if (dto.estado !== undefined) {
      values.push(dto.estado);
      updates.push(`estado = $${values.length}`);
    }

    if (dto.capacidad !== undefined) {
      values.push(dto.capacidad);
      updates.push(`capacidad = $${values.length}`);
    }

    if (updates.length === 0) {
      throw new BadRequestException('Debes enviar al menos un campo para actualizar.');
    }

    values.push(id);
    const result = await this.db.query(
      `UPDATE transporte SET ${updates.join(', ')} WHERE id = $${values.length} RETURNING id, placa, iot_id, empresa_id, estado, capacidad`,
      values,
    );
    return result.rows[0];
  }

  async delete(id: string) {
    await this.findOne(id);
    await this.db.query('DELETE FROM transporte WHERE id = $1', [id]);
    return { deleted: true, id };
  }
}
