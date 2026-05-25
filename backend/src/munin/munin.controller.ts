import { Controller, Get } from '@nestjs/common';

@Controller('munin')
export class MuninController {
  @Get('metrics')
  getMetrics(): string {
    const memory = process.memoryUsage();
    return `
        heapTotal.value ${memory.heapTotal}
        heapUsed.value ${memory.heapUsed}
        rss.value ${memory.rss}
        uptime.value ${process.uptime()}
        `.trim();
  }
}
