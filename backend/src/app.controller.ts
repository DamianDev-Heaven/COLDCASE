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
}
