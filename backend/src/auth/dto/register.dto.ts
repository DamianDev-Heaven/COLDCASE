import { IsEmail, IsIn, IsString, MinLength } from "class-validator";

export class RegisterDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsString()
  @IsIn(["Admin", "Operador", "Auditor"])
  rol: "Admin" | "Operador" | "Auditor";
}
