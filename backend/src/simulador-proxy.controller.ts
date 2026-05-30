import { Controller, Get, All, Req, Res, UseGuards } from '@nestjs/common';
import * as express from 'express';
import { AuthGuard } from './auth/auth.guard';

@Controller()
@UseGuards(AuthGuard)
export class SimuladorProxyController {
  private readonly simuladorUrl =
    process.env.SIMULADOR_URL || 'http://simulador:4000';

  @Get('simulador')
  async getConsole(@Req() req: express.Request, @Res() res: express.Response) {
    try {
      let token = req.query.token as string;
      if (!token && req.headers.authorization?.startsWith('Bearer ')) {
        token = req.headers.authorization.slice('Bearer '.length);
      }
      const cookies = (
        req as express.Request & { cookies?: { access_token?: string } }
      ).cookies;
      if (!token && cookies?.access_token) {
        token = cookies.access_token!;
      }

      if (token) {
        res.cookie('access_token', token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 24 * 60 * 60 * 1000, // 24 hours
        });
      }

      const response = await fetch(`${this.simuladorUrl}/`);
      let html = await response.text();

      if (token) {
        const injectScript = `<script>window.__TOKEN__ = "${token}";</script>`;
        html = html.replace('<head>', `<head>${injectScript}`);
      }

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
