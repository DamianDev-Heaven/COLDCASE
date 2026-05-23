import {
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class CreateViajeDto {
  @IsUUID()
  transporte_id: string;

  @IsNumber()
  limite_max_temp: number;

  @IsOptional()
  @IsUUID()
  sucursal_origen_id?: string;

  @IsOptional()
  @IsUUID()
  sucursal_destino_id?: string;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  origen_lon: number;

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  origen_lat: number;

  @IsOptional()
  @IsNumber()
  @Min(-180)
  @Max(180)
  destino_lon: number;

  @IsOptional()
  @IsNumber()
  @Min(-90)
  @Max(90)
  destino_lat: number;

  @IsOptional()
  @IsObject()
  ruta_waypoints?: Record<string, unknown> | Array<{ lat: number; lon: number }>;

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
  @IsIn(['pendiente', 'en_curso', 'pausado', 'cancelado', 'finalizado'])
  estado?: 'pendiente' | 'en_curso' | 'pausado' | 'cancelado' | 'finalizado';
}
