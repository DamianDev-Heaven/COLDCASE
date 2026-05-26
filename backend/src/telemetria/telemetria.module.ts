import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { IncidenteModule } from '../incidente/incidente.module';
import { IaModule } from '../ia/ia.module';
import { TelemetriaController } from './telemetria.controller';
import { TelemetriaService } from './telemetria.service';
import { TelemetriaContingencyProcessor } from './telemetria.processor';
import { TemperatureAnomalyDetector } from './detectors/temperature-anomaly.detector';
import { BatteryAnomalyDetector } from './detectors/battery-anomaly.detector';
import { RouteDeviationDetector } from './detectors/route-deviation.detector';

@Module({
  imports: [
    IncidenteModule,
    IaModule,
    BullModule.registerQueue({
      name: 'telemetria-contingency-queue',
    }),
  ],
  controllers: [TelemetriaController],
  providers: [
    TelemetriaService,
    TelemetriaContingencyProcessor,
    TemperatureAnomalyDetector,
    BatteryAnomalyDetector,
    RouteDeviationDetector,
  ],
  exports: [TelemetriaService],
})
export class TelemetriaModule {}
