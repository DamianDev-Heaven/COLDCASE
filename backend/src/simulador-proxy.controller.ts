import { Controller, Get, All, Req, Res, UseGuards } from '@nestjs/common';
import * as express from 'express';
import { AuthGuard } from './auth/auth.guard';

@Controller()
@UseGuards(AuthGuard)
export class SimuladorProxyController {
  private readonly simuladorUrl =
    process.env.SIMULADOR_URL || 'http://simulador:4000';

  @Get('simulador')
  async getConsole(@Res() res: express.Response) {
    try {
      const response = await fetch(`${this.simuladorUrl}/`);
      const html = await response.text();
      res.setHeader('Content-Type', 'text/html');
      res.send(html);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res
        .status(500)
        .send(`Error de comunicación con el simulador: ${message}`);
    }
  }

  @All('api/state')
  async proxyState(@Req() req: express.Request, @Res() res: express.Response) {
    await this.proxyRequest(req, res, 'api/state');
  }

  @All('api/simulation/*')
  async proxySimulation(
    @Req() req: express.Request,
    @Res() res: express.Response,
  ) {
    const wildcardPath = req.params[0] || '';
    const path = wildcardPath
      ? `api/simulation/${wildcardPath}`
      : req.path.replace(/^\//, '');
    await this.proxyRequest(req, res, path);
  }

  private async proxyRequest(
    req: express.Request,
    res: express.Response,
    path: string,
  ) {
    try {
      const url = `${this.simuladorUrl}/${path}`;
      const method = req.method;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      const fetchOptions: RequestInit = {
        method,
        headers,
      };

      if (method !== 'GET' && method !== 'HEAD') {
        fetchOptions.body = JSON.stringify(req.body);
      }

      const response = await fetch(url, fetchOptions);
      const data = await response.text();

      res.status(response.status);
      res.setHeader(
        'Content-Type',
        response.headers.get('Content-Type') || 'application/json',
      );
      res.send(data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res
        .status(500)
        .send({ message: `Error proxying request to simulator: ${message}` });
    }
  }
}
