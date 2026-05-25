import { Body, Controller, Get, Param, Post, Patch } from '@nestjs/common';
import { CreateViajeDto } from './dto/create-viaje.dto';
import { ViajeService } from './viaje.service';

@Controller('viaje')
export class ViajeController {
  constructor(private readonly viajeService: ViajeService) {}

  @Post()
  create(@Body() body: CreateViajeDto) {
    return this.viajeService.create(body);
  }

  @Post('ruta-preview')
  previewRoute(
    @Body()
    body: {
      waypoints: Array<{ lat: number; lon: number }>;
    },
  ) {
    return this.viajeService.previewRoute(body.waypoints);
  }

  @Get()
  findAll() {
    return this.viajeService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.viajeService.findOne(id);
  }

  @Patch(':id/iniciar')
  iniciar(@Param('id') id: string) {
    return this.viajeService.iniciar(id);
  }

  @Patch(':id/finalizar')
  finalizar(@Param('id') id: string) {
    return this.viajeService.finalizar(id);
  }
}
