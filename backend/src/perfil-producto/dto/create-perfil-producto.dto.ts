import { IsNumber, IsString, MinLength, Matches } from 'class-validator';

export class CreatePerfilProductoDto {
  @IsString()
  @MinLength(3)
  @Matches(/^[a-z0-9-_]+$/, {
    message:
      'El ID debe ser en minúsculas, compuesto por letras, números, guiones y guiones bajos (e.g., lacteos-frescos).',
  })
  id: string;

  @IsString()
  @MinLength(3)
  nombre: string;

  @IsNumber()
  limite_min_temp: number;

  @IsNumber()
  limite_max_temp: number;

  @IsNumber()
  limite_min_humedad: number;

  @IsNumber()
  limite_max_humedad: number;
}
