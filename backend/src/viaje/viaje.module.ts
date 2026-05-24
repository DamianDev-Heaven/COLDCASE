import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ViajeController } from './viaje.controller';
import { ViajesController } from './viajes.controller';
import { ViajeService } from './viaje.service';

@Module({
  imports: [ConfigModule],
  controllers: [ViajeController, ViajesController],
  providers: [ViajeService],
})
export class ViajeModule {}
