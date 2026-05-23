import { Module } from '@nestjs/common';
import { SucursalController } from './sucursal.controller';
import { SucursalService } from './sucursal.service';

@Module({
  controllers: [SucursalController],
  providers: [SucursalService],
})
export class SucursalModule {}
