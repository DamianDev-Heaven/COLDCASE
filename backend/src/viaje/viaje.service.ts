import { Injectable, NotFoundException } from "@nestjs/common";
import { DbService } from "../db/db.service";

@Injectable()
export class ViajeService {
  constructor(private readonly db: DbService) {}

  async create(payload: {
    transporte_id: string;
    limite_max_temp: number;
    ruta_waypoints: Record<string, unknown>;
    margen_desvio_km?: number;
    inicio_viaje?: string;
    final_viaje?: string;
    estado?: "pendiente" | "en_curso" | "pausado" | "cancelado" | "finalizado";
  }) {
    const result = await this.db.query(
      "INSERT INTO viaje (transporte_id, limite_max_temp, ruta_waypoints, margen_desvio_km, inicio_viaje, final_viaje, estado) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, transporte_id, limite_max_temp, ruta_waypoints, margen_desvio_km, inicio_viaje, final_viaje, estado",
      [
        payload.transporte_id,
        payload.limite_max_temp,
        JSON.stringify(payload.ruta_waypoints),
        payload.margen_desvio_km ?? null,
        payload.inicio_viaje ?? null,
        payload.final_viaje ?? null,
        payload.estado ?? "pendiente",
      ],
    );

    return result.rows[0];
  }

  async findAll() {
    const result = await this.db.query(
      "SELECT id, transporte_id, limite_max_temp, ruta_waypoints, margen_desvio_km, inicio_viaje, final_viaje, estado FROM viaje ORDER BY inicio_viaje DESC NULLS LAST",
    );

    return result.rows;
  }

  async findOne(id: string) {
    const result = await this.db.query(
      "SELECT id, transporte_id, limite_max_temp, ruta_waypoints, margen_desvio_km, inicio_viaje, final_viaje, estado FROM viaje WHERE id = $1",
      [id],
    );

    const viaje = result.rows[0];
    if (!viaje) {
      throw new NotFoundException("Viaje no encontrado.");
    }

    return viaje;
  }
}
