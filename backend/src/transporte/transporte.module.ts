import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TransporteController } from './transporte.controller';
import { TransporteService } from './transporte.service';

@Module({
  imports: [AuthModule],
  controllers: [TransporteController],
  providers: [TransporteService],
})
export class TransporteModule {}
