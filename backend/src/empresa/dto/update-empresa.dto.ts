import { IsString, MinLength } from 'class-validator';

export class UpdateEmpresaDto {
  @IsString()
  @MinLength(2)
  nombre: string;
}
