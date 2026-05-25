import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { ViajeController } from './viaje.controller';
import { ViajesController } from './viajes.controller';
import { ViajeService } from './viaje.service';
import { IaModule } from '../ia/ia.module';
import { PdfProcessor } from './pdf.processor';

@Module({
  imports: [
    ConfigModule,
    IaModule,
    BullModule.registerQueue({
      name: 'pdf-queue',
    }),
  ],
  controllers: [ViajeController, ViajesController],
  providers: [ViajeService, PdfProcessor],
})
export class ViajeModule {}
