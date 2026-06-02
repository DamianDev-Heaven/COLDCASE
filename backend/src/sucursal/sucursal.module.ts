import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SucursalController } from './sucursal.controller';
import { SucursalService } from './sucursal.service';

@Module({
  imports: [AuthModule],
  controllers: [SucursalController],
  providers: [SucursalService],
})
export class SucursalModule {}
