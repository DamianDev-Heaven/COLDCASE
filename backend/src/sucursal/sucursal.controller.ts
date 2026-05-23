import { Body, Controller, Get, Post } from '@nestjs/common';
import { CreateSucursalDto } from './dto/create-sucursal.dto';
import { SucursalService } from './sucursal.service';

@Controller('sucursal')
export class SucursalController {
  constructor(private readonly sucursalService: SucursalService) {}

  @Post()
  create(@Body() body: CreateSucursalDto) {
    return this.sucursalService.create(body);
  }

  @Get()
  findAll() {
    return this.sucursalService.findAll();
  }
}
