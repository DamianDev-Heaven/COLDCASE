import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MinLength,
  Matches,
} from 'class-validator';

export class UpdateTransporteDto {
  @IsOptional()
  @IsString()
  @MinLength(4)
  @Matches(/^[A-Z]{1,3}[ -]?[0-9]{3,6}$/, {
    message:
      'La placa debe tener un formato válido (ej. P123-456, T123456, QRO-772). Debe comenzar con 1 a 3 letras, seguido opcionalmente de un guión o espacio, y finalizar con 3 a 6 dígitos.',
  })
  placa?: string;

  @IsOptional()
  @IsString()
  iot_id?: string;

  @IsOptional()
  @IsString()
  empresa_id?: string;

  @IsOptional()
  @IsString()
  @IsIn(['Activo', 'Mantenimiento'])
  estado?: 'Activo' | 'Mantenimiento';

  @IsOptional()
  @IsNumber()
  capacidad?: number;
}
