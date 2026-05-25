import { Controller, Get, Param } from '@nestjs/common';
import { IncidenteService } from './incidente.service';

@Controller('incidente')
export class IncidenteController {
  constructor(private readonly incidenteService: IncidenteService) {}

  @Get()
  findAll() {
    return this.incidenteService.findAll();
  }

  @Get('viaje/:viajeId')
  findByViaje(@Param('viajeId') viajeId: string) {
    return this.incidenteService.findByViaje(viajeId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.incidenteService.findOne(id);
  }
}
