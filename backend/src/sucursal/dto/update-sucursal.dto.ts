import {
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';

export class UpdateSucursalDto {
  @IsOptional()
  @IsUUID()
  empresa_id?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  nombre?: string;

  @IsOptional()
  @IsNumber()
  lat?: number;

  @IsOptional()
  @IsNumber()
  lon?: number;

  @IsOptional()
  @IsString()
  direccion?: string;
}
