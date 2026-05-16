import { Injectable } from "@nestjs/common";
import { DbService } from "../db/db.service";

@Injectable()
export class TransporteService {
  constructor(private readonly db: DbService) {}

  async create(payload: {
    placa: string;
    iot_id: string;
    empresa_id: string;
    estado: "Activo" | "Mantenimiento";
    capacidad?: number;
  }) {
    const result = await this.db.query(
      "INSERT INTO transporte (placa, iot_id, empresa_id, estado, capacidad) VALUES ($1, $2, $3, $4, $5) RETURNING id, placa, iot_id, empresa_id, estado, capacidad",
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
      "SELECT id, placa, iot_id, empresa_id, estado, capacidad FROM transporte ORDER BY placa ASC",
    );

    return result.rows;
  }
}
