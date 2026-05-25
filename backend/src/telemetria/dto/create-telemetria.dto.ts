import {
  IsDateString,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class CreateTelemetriaDto {
  @IsUUID()
  viaje_id: string;

  @IsLatitude()
  lat: number;

  @IsLongitude()
  lon: number;

  @IsNumber()
  temp: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  humedad?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  bateria?: number;

  @IsDateString()
  timestamp_sensor: string;
}
