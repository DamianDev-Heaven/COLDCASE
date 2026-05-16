import { Injectable } from "@nestjs/common";
import { DbService } from "../db/db.service";

@Injectable()
export class EmpresaService {
  constructor(private readonly db: DbService) {}

  async create(nombre: string) {
    const result = await this.db.query(
      "INSERT INTO empresa (nombre) VALUES ($1) RETURNING id, nombre",
      [nombre],
    );

    return result.rows[0];
  }

  async findAll() {
    const result = await this.db.query(
      "SELECT id, nombre FROM empresa ORDER BY nombre ASC",
    );

    return result.rows;
  }
}
