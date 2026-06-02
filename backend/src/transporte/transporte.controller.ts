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
import { CreateTransporteDto } from './dto/create-transporte.dto';
import { UpdateTransporteDto } from './dto/update-transporte.dto';
import { TransporteService } from './transporte.service';

@Controller('transporte')
@UseGuards(AuthGuard, RolesGuard)
export class TransporteController {
  constructor(private readonly transporteService: TransporteService) {}

  @Post()
  @Roles('Admin')
  create(@Body() body: CreateTransporteDto) {
    return this.transporteService.create(body);
  }

  @Get()
  findAll() {
    return this.transporteService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.transporteService.findOne(id);
  }

  @Patch(':id')
  @Roles('Admin')
  update(@Param('id') id: string, @Body() body: UpdateTransporteDto) {
    return this.transporteService.update(id, body);
  }

  @Delete(':id')
  @Roles('Admin')
  delete(@Param('id') id: string) {
    return this.transporteService.delete(id);
  }
}
