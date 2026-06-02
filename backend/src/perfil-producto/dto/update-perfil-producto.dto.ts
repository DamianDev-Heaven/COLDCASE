import { IsNumber, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdatePerfilProductoDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  nombre?: string;

  @IsOptional()
  @IsNumber()
  limite_min_temp?: number;

  @IsOptional()
  @IsNumber()
  limite_max_temp?: number;

  @IsOptional()
  @IsNumber()
  limite_min_humedad?: number;

  @IsOptional()
  @IsNumber()
  limite_max_humedad?: number;
}
