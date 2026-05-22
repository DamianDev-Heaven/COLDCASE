import { Body, Controller, Get, Post } from '@nestjs/common';
import { CreateTransporteDto } from './dto/create-transporte.dto';
import { TransporteService } from './transporte.service';

@Controller('transporte')
export class TransporteController {
  constructor(private readonly transporteService: TransporteService) {}

  @Post()
  create(@Body() body: CreateTransporteDto) {
    return this.transporteService.create(body);
  }

  @Get()
  findAll() {
    return this.transporteService.findAll();
  }
}
