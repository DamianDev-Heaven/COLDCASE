import { Module } from "@nestjs/common";
import { ViajeController } from "./viaje.controller";
import { ViajeService } from "./viaje.service";

@Module({
  controllers: [ViajeController],
  providers: [ViajeService],
})
export class ViajeModule {}
