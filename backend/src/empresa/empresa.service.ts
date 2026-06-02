import { Injectable, NotFoundException } from '@nestjs/common';
import { DbService } from '../db/db.service';

@Injectable()
export class EmpresaService {
  constructor(private readonly db: DbService) {}

  async create(nombre: string) {
    const result = await this.db.query(
      'INSERT INTO empresa (nombre) VALUES ($1) RETURNING id, nombre',
      [nombre],
    );

    return result.rows[0];
  }

  async findAll() {
    const result = await this.db.query(
      'SELECT id, nombre FROM empresa ORDER BY nombre ASC',
    );

    return result.rows;
  }

  async findOne(id: string) {
    const result = await this.db.query(
      'SELECT id, nombre FROM empresa WHERE id = $1',
      [id],
    );
    const empresa = result.rows[0];
    if (!empresa) {
      throw new NotFoundException('Empresa no encontrada.');
    }
    return empresa;
  }

  async update(id: string, nombre: string) {
    await this.findOne(id);
    const result = await this.db.query(
      'UPDATE empresa SET nombre = $1 WHERE id = $2 RETURNING id, nombre',
      [nombre, id],
    );
    return result.rows[0];
  }

  async delete(id: string) {
    await this.findOne(id);
    await this.db.query('DELETE FROM empresa WHERE id = $1', [id]);
    return { deleted: true, id };
  }
}
