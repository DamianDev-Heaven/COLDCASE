import { Controller, Get } from '@nestjs/common';
import { ViajeService } from './viaje.service';

@Controller('viajes')
export class ViajesController {
  constructor(private readonly viajeService: ViajeService) {}

  @Get('en-curso')
  findEnCurso() {
    return this.viajeService.findEnCurso();
  }
}
