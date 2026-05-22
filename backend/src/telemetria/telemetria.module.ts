import { Module } from '@nestjs/common';
import { IncidenteModule } from '../incidente/incidente.module';
import { TelemetriaController } from './telemetria.controller';
import { TelemetriaService } from './telemetria.service';

@Module({
  imports: [IncidenteModule],
  controllers: [TelemetriaController],
  providers: [TelemetriaService],
})
export class TelemetriaModule {}