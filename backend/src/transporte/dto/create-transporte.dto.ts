import { IsIn, IsNumber, IsOptional, IsString, IsUUID, MinLength } from "class-validator";

export class CreateTransporteDto {
  @IsString()
  @MinLength(4)
  placa: string;

  @IsUUID()
  iot_id: string;

  @IsUUID()
  empresa_id: string;

  @IsString()
  @IsIn(["Activo", "Mantenimiento"])
  estado: "Activo" | "Mantenimiento";

  @IsOptional()
  @IsNumber()
  capacidad?: number;
}
