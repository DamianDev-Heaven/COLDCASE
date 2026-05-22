import { IsDateString, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateIotDto {
  @IsString()
  @MinLength(2)
  tipo_dispositivo: string;

  @IsString()
  @MinLength(2)
  estado_conexion: string;

  @IsDateString()
  ultimo_ping: string;

  @IsOptional()
  @IsString()
  firmware_version?: string;
}
