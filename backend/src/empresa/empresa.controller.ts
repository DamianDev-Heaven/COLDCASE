import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CreateEmpresaDto } from './dto/create-empresa.dto';
import { UpdateEmpresaDto } from './dto/update-empresa.dto';
import { EmpresaService } from './empresa.service';

@Controller('empresa')
@UseGuards(AuthGuard, RolesGuard)
export class EmpresaController {
  constructor(private readonly empresaService: EmpresaService) {}

  @Post()
  @Roles('Admin')
  create(@Body() body: CreateEmpresaDto) {
    return this.empresaService.create(body.nombre);
  }

  @Get()
  findAll() {
    return this.empresaService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.empresaService.findOne(id);
  }

  @Patch(':id')
  @Roles('Admin')
  update(@Param('id') id: string, @Body() body: UpdateEmpresaDto) {
    return this.empresaService.update(id, body.nombre);
  }

  @Delete(':id')
  @Roles('Admin')
  delete(@Param('id') id: string) {
    return this.empresaService.delete(id);
  }
}
