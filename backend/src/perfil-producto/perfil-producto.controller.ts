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
import { CreatePerfilProductoDto } from './dto/create-perfil-producto.dto';
import { UpdatePerfilProductoDto } from './dto/update-perfil-producto.dto';
import { PerfilProductoService } from './perfil-producto.service';

@Controller('perfil-producto')
@UseGuards(AuthGuard, RolesGuard)
export class PerfilProductoController {
  constructor(private readonly service: PerfilProductoService) {}

  @Post()
  @Roles('Admin')
  create(@Body() dto: CreatePerfilProductoDto) {
    return this.service.create(dto);
  }

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @Roles('Admin')
  update(@Param('id') id: string, @Body() dto: UpdatePerfilProductoDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Roles('Admin')
  delete(@Param('id') id: string) {
    return this.service.delete(id);
  }
}
