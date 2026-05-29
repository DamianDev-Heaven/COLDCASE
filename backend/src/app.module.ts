import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { DbModule } from './db/db.module';
import { EmpresaModule } from './empresa/empresa.module';
import { IncidenteModule } from './incidente/incidente.module';
import { IaModule } from './ia/ia.module';
import { IotModule } from './iot/iot.module';
import { TelemetriaModule } from './telemetria/telemetria.module';
import { TransporteModule } from './transporte/transporte.module';
import { SucursalModule } from './sucursal/sucursal.module';
import { ViajeModule } from './viaje/viaje.module';
import { MuninController } from './munin/munin.controller';
import { SimuladorProxyController } from './simulador-proxy.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 100,
    }]),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('REDIS_HOST') ?? 'localhost',
          port: Number(config.get<string | number>('REDIS_PORT') ?? 6379),
        },
      }),
      inject: [ConfigService],
    }),
    DbModule,
    AuthModule,
    EmpresaModule,
    IncidenteModule,
    IotModule,
    IaModule,
    TelemetriaModule,
    TransporteModule,
    SucursalModule,
    ViajeModule,
  ],
  controllers: [AppController, MuninController, SimuladorProxyController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
