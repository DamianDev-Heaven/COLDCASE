import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CreateTelemetriaDto } from './dto/create-telemetria.dto';
import { TelemetriaService } from './telemetria.service';

@Controller('telemetria')
export class TelemetriaController {
  constructor(private readonly telemetriaService: TelemetriaService) {}

  @Post()
  create(@Body() body: CreateTelemetriaDto) {
    return this.telemetriaService.create(body);
  }

  @Get()
  findAll() {
    return this.telemetriaService.findAll();
  }

  @Get('viaje/:viajeId')
  findByViaje(@Param('viajeId') viajeId: string) {
    return this.telemetriaService.findByViaje(viajeId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.telemetriaService.findOne(Number(id));
  }
}