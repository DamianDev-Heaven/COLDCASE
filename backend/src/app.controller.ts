import {
  Controller,
  Get,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { AppService } from './app.service';
import { DbService } from './db/db.service';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Controller()
export class AppController {
  private readonly logger = new Logger(AppController.name);

  constructor(
    private readonly appService: AppService,
    private readonly db: DbService,
    @InjectQueue('ia-analysis-queue') private readonly iaQueue: Queue,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  async getHealth() {
    let dbStatus = 'down';
    let redisStatus = 'down';

    try {
      await this.db.query('SELECT 1');
      dbStatus = 'ok';
    } catch (err) {
      this.logger.error('Database health check failed', err);
    }

    try {
      // Verificar conexión de Redis consultando el estado de la cola (de forma rápida y segura)
      await this.iaQueue.isPaused();
      redisStatus = 'ok';
    } catch (err) {
      this.logger.error('Redis health check failed', err);
    }

    if (dbStatus !== 'ok' || redisStatus !== 'ok') {
      throw new ServiceUnavailableException({
        status: 'down',
        db: dbStatus,
        redis: redisStatus,
      });
    }

    return {
      status: 'ok',
      db: dbStatus,
      redis: redisStatus,
    };
  }

  @Get('health/osrm')
  async getOsrmHealth() {
    let osrmStatus = 'down';
    const osrmBaseUrl = process.env.OSRM_BASE_URL || 'http://localhost:5000';

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000); // 2 seconds timeout
      const res = await fetch(
        `${osrmBaseUrl}/route/v1/driving/-89.2182,13.6929;-89.2045,13.7001?overview=false`,
        {
          signal: controller.signal,
        },
      );
      clearTimeout(timeoutId);

      if (res.ok) {
        const body = (await res.json()) as { code?: string };
        if (body.code === 'Ok') {
          osrmStatus = 'ok';
        }
      }
    } catch (err) {
      this.logger.error('OSRM health check failed', err);
    }

    if (osrmStatus !== 'ok') {
      throw new ServiceUnavailableException({
        status: 'down',
        osrm: osrmStatus,
      });
    }

    return {
      status: 'ok',
      osrm: osrmStatus,
    };
  }

  
  @Get('monitoring/coldchain')
  async getColdChainMonitoring() {
    let database = false;
    let redis = false;

    try {
      await this.db.query('SELECT 1');
      database = true;
    } catch {
      //
    }

    try {
      await this.iaQueue.isPaused();
      redis = true;
    } catch {
      //
    }

    return {
      status: database && redis ? 'ok' : 'degraded',
      infrastructure: {
        backend: true,
        database,
        redis,
      },
      timestamp: new Date(),
    };
  }

}
