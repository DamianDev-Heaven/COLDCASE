import {
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';

export class CreateSucursalDto {
  @IsUUID()
  empresa_id: string;

  @IsString()
  @MinLength(2)
  nombre: string;

  @IsNumber()
  lat: number;

  @IsNumber()
  lon: number;

  @IsOptional()
  @IsString()
  direccion?: string;
}
