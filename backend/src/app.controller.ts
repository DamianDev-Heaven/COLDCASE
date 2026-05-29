import { Controller, Get, Logger, ServiceUnavailableException } from '@nestjs/common';
import { AppService } from './app.service';
import { DbService } from './db/db.service';

@Controller()
export class AppController {
  private readonly logger = new Logger(AppController.name);

  constructor(
    private readonly appService: AppService,
    private readonly db: DbService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  async getHealth() {
    try {
      await this.db.query('SELECT 1');
      return { status: 'ok', db: 'up' };
    } catch (err) {
      this.logger.error('Database health check failed', err);
      throw new ServiceUnavailableException({
        status: 'down',
        db: 'down',
      });
    }
  }
}
