import { IsString, MinLength } from 'class-validator';

export class CreateEmpresaDto {
  @IsString()
  @MinLength(2)
  nombre: string;
}
