import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ViajeController } from "./viaje.controller";
import { ViajeService } from "./viaje.service";

@Module({
  imports: [ConfigModule],
  controllers: [ViajeController],
  providers: [ViajeService],
})
export class ViajeModule {}
