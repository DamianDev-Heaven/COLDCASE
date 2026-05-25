import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ViajeController } from './viaje.controller';
import { ViajesController } from './viajes.controller';
import { ViajeService } from './viaje.service';
import { IaModule } from '../ia/ia.module';

@Module({
  imports: [ConfigModule, IaModule],
  controllers: [ViajeController, ViajesController],
  providers: [ViajeService],
})
export class ViajeModule {}
