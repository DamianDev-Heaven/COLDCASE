import { Body, Controller, Get, Post } from "@nestjs/common";
import { CreateEmpresaDto } from "./dto/create-empresa.dto";
import { EmpresaService } from "./empresa.service";

@Controller("empresa")
export class EmpresaController {
  constructor(private readonly empresaService: EmpresaService) {}

  @Post()
  create(@Body() body: CreateEmpresaDto) {
    return this.empresaService.create(body.nombre);
  }

  @Get()
  findAll() {
    return this.empresaService.findAll();
  }
}
