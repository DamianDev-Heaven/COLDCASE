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
import { CreateSucursalDto } from './dto/create-sucursal.dto';
import { UpdateSucursalDto } from './dto/update-sucursal.dto';
import { SucursalService } from './sucursal.service';

@Controller('sucursal')
@UseGuards(AuthGuard, RolesGuard)
export class SucursalController {
  constructor(private readonly sucursalService: SucursalService) {}

  @Post()
  @Roles('Admin')
  create(@Body() body: CreateSucursalDto) {
    return this.sucursalService.create(body);
  }

  @Get()
  findAll() {
    return this.sucursalService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.sucursalService.findOne(id);
  }

  @Patch(':id')
  @Roles('Admin')
  update(@Param('id') id: string, @Body() body: UpdateSucursalDto) {
    return this.sucursalService.update(id, body);
  }

  @Delete(':id')
  @Roles('Admin')
  delete(@Param('id') id: string) {
    return this.sucursalService.delete(id);
  }
}
