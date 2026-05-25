import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
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

  /**
   * GET /ia/historial/:viajeId
   * Devuelve la bitácora de inferencias de IA para un viaje,
   * ordenada por fecha descendente.
   */
  @Get('historial/:viajeId')
  obtenerHistorial(@Param('viajeId', ParseUUIDPipe) viajeId: string) {
    return this.iaService.obtenerHistorialAnalisis(viajeId);
  }

  /**
   * GET /ia/contexto-grafo/:viajeId
   * Recupera el contexto global del Grafo de Conocimiento Standalone de Zep
   * para un viaje y una consulta semántica.
   */
  @Get('contexto-grafo/:viajeId')
  obtenerContextoGrafo(
    @Param('viajeId') viajeId: string,
    @Query('query') query: string,
  ) {
    return this.iaService.obtenerContextoGrafo(viajeId, query);
  }

  /**
   * POST /ia/queue/pause
   * Pausa el worker de la cola de análisis de IA.
   */
  @Post('queue/pause')
  pausarCola() {
    return this.iaService.pauseQueue();
  }

  /**
   * POST /ia/queue/resume
   * Reanuda el worker de la cola de análisis de IA.
   */
  @Post('queue/resume')
  reanudarCola() {
    return this.iaService.resumeQueue();
  }

  /**
   * GET /ia/queue/status
   * Obtiene el estado actual de la cola.
   */
  @Get('queue/status')
  obtenerEstadoCola() {
    return this.iaService.getQueueStatus();
  }

  /**
   * GET /ia/grafo/buscar
   * Realiza una búsqueda directa en el Grafo Global de Zep y retorna nodos y aristas.
   */
  @Get('grafo/buscar')
  buscarEnGrafo(@Query('query') query: string) {
    return this.iaService.buscarEnGrafoGlobal(query);
  }
}
