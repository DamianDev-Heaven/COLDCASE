import { Module } from "@nestjs/common";
import { TransporteController } from "./transporte.controller";
import { TransporteService } from "./transporte.service";

@Module({
  controllers: [TransporteController],
  providers: [TransporteService],
})
export class TransporteModule {}
