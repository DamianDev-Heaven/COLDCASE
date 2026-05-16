import { IsNumber, IsString, Min } from "class-validator";

export class AnalizarFalloDto {
  @IsString()
  iot_id: string;

  @IsNumber()
  temperaturaActual: number;

  @IsNumber()
  @Min(0)
  bateriaActual: number;
}