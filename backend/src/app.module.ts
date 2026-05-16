import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { AuthModule } from "./auth/auth.module";
import { DbModule } from "./db/db.module";
import { EmpresaModule } from "./empresa/empresa.module";
import { IaModule } from "./ia/ia.module";
import { IotModule } from "./iot/iot.module";
import { TransporteModule } from "./transporte/transporte.module";
import { ViajeModule } from "./viaje/viaje.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DbModule,
    AuthModule,
    EmpresaModule,
    IotModule,
    IaModule,
    TransporteModule,
    ViajeModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
