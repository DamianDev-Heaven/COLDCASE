import { IsNumber, IsString, IsUUID, Min } from 'class-validator';

export class CreateIncidenteDto {
  @IsUUID()
  viaje_id: string;

  @IsNumber()
  telemetria_id: number;

  @IsString()
  tipo_alerta: 'TEMP_ALTA' | 'FUERA_RUTA' | 'BATERIA_BAJA';

  @IsNumber()
  valor_detectado: number;

  @IsNumber()
  @Min(-1000)
  umbral_permitido: number;
}