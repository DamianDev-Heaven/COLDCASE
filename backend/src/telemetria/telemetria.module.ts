import { Module } from '@nestjs/common';
import { IncidenteModule } from '../incidente/incidente.module';
import { IaModule } from '../ia/ia.module';
import { TelemetriaController } from './telemetria.controller';
import { TelemetriaService } from './telemetria.service';

@Module({
  imports: [IncidenteModule, IaModule],
  controllers: [TelemetriaController],
  providers: [TelemetriaService],
})
export class TelemetriaModule {}