import { Module } from '@nestjs/common';
import { DbModule } from '../db/db.module';
import { IncidenteController } from './incidente.controller';
import { IncidenteService } from './incidente.service';

@Module({
  imports: [DbModule],
  controllers: [IncidenteController],
  providers: [IncidenteService],
  exports: [IncidenteService],
})
export class IncidenteModule {}