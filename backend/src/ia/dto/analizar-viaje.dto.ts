import {
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class AnalizarViajeDto {
  @IsString()
  iot_id: string;

  @IsNumber()
  temperaturaActual: number;

  @IsNumber()
  @Min(0)
  bateriaActual: number;

  @IsOptional()
  @IsUUID()
  viaje_id?: string;

  @IsOptional()
  @IsNumber()
  limite_max_temp?: number;

  @IsOptional()
  @IsNumber()
  margen_desvio_km?: number;

  @IsOptional()
  @IsNumber()
  latitudActual?: number;

  @IsOptional()
  @IsNumber()
  longitudActual?: number;

  @IsOptional()
  @IsObject()
  ruta_waypoints?:
    | { waypoints?: Array<{ lat: number; lon: number }> }
    | Array<{ lat: number; lon: number }>;

  @IsOptional()
  @IsIn(['auto', 'deterministic', 'llm'])
  modo?: 'auto' | 'deterministic' | 'llm';
}
