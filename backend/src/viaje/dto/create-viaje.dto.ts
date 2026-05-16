import {
  IsDateString,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsUUID,
} from "class-validator";

export class CreateViajeDto {
  @IsUUID()
  transporte_id: string;

  @IsNumber()
  limite_max_temp: number;

  @IsObject()
  ruta_waypoints: Record<string, unknown>;

  @IsOptional()
  @IsNumber()
  margen_desvio_km?: number;

  @IsOptional()
  @IsDateString()
  inicio_viaje?: string;

  @IsOptional()
  @IsDateString()
  final_viaje?: string;

  @IsOptional()
  @IsIn(["pendiente", "en_curso", "pausado", "cancelado", "finalizado"])
  estado?: "pendiente" | "en_curso" | "pausado" | "cancelado" | "finalizado";
}
