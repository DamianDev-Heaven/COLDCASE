import { Body, Controller, Post } from '@nestjs/common';
import { AnalizarFalloDto } from './dto/analizar-fallo.dto';
import { AnalizarViajeDto } from './dto/analizar-viaje.dto';
import { IaService } from './ia.service';

@Controller('ia')
export class IaController {
  constructor(private readonly iaService: IaService) {}

  @Post('analizar-fallo')
  analizarFallo(@Body() body: AnalizarFalloDto) {
    return this.iaService.simularAnalisisDeFallo(
      body.iot_id,
      body.temperaturaActual,
      body.bateriaActual,
    );
  }

  @Post('analizar-viaje')
  analizarViaje(@Body() body: AnalizarViajeDto) {
    return this.iaService.analizarEvento(body);
  }
}
