import { Body, Controller, Get, Param, Post } from '@nestjs/common';
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

  @Post('viaje/:viajeId/resolver-todas')
  resolverTodas(
    @Param('viajeId') viajeId: string,
    @Body() body: { comentario?: string },
  ) {
    return this.incidenteService.resolverTodas(viajeId, body?.comentario);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.incidenteService.findOne(id);
  }

  @Post(':id/resolver')
  resolver(@Param('id') id: string, @Body() body: { comentario: string }) {
    return this.incidenteService.resolver(id, body.comentario);
  }
}
