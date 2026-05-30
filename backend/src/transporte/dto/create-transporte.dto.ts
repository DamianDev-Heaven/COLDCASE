import {
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateTransporteDto {
  @IsString()
  @MinLength(4)
  placa: string;

  @IsString()
  iot_id: string;

  @IsString()
  empresa_id: string;

  @IsString()
  @IsIn(['Activo', 'Mantenimiento'])
  estado: 'Activo' | 'Mantenimiento';

  @IsOptional()
  @IsNumber()
  capacidad?: number;
}
