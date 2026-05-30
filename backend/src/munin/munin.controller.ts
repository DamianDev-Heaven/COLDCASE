import { Controller, Get, Req, Res } from '@nestjs/common';
import * as express from 'express';

@Controller('munin')
export class MuninController {
  @Get('metrics')
  getMetrics(@Req() req: express.Request, @Res() res: express.Response) {
    const accept = req.headers.accept || '';
    const memory = process.memoryUsage();
    const uptime = process.uptime();

    if (accept.includes('text/html')) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(this.renderHtmlDashboard(memory, uptime));
    } else {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.send(`
heapTotal.value ${memory.heapTotal}
heapUsed.value ${memory.heapUsed}
rss.value ${memory.rss}
uptime.value ${uptime}
      `.trim());
    }
  }

  private renderHtmlDashboard(memory: any, uptime: number): string {
    const toMB = (bytes: number) => (bytes / (1024 * 1024)).toFixed(2);
    const usagePercent = ((memory.heapUsed / memory.heapTotal) * 100).toFixed(1);
    
    // Format Uptime
    const d = Math.floor(uptime / (3600*24));
    const h = Math.floor(uptime % (3600*24) / 3600);
    const m = Math.floor(uptime % 3600 / 60);
    const s = Math.floor(uptime % 60);
    const uptimeStr = `${d > 0 ? d + 'd ' : ''}${h}h ${m}m ${s}s`;

    return `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="refresh" content="5">
        <title>COLDCASE v2 — Munin Live Engine</title>
        <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&display=swap" rel="stylesheet">
        <style>
          :root {
            --bg-color: #0b0f19;
            --panel-bg: rgba(17, 24, 39, 0.7);
            --border-color: rgba(255, 255, 255, 0.08);
            --primary: #10b981;
            --primary-glow: rgba(16, 185, 129, 0.2);
            --accent: #8b5cf6;
            --accent-glow: rgba(139, 92, 246, 0.2);
            --text-main: #f3f4f6;
            --text-muted: #9ca3af;
          }

          * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
          }

          body {
            font-family: 'Outfit', sans-serif;
            background-color: var(--bg-color);
            background-image: 
              radial-gradient(at 0% 0%, rgba(16, 185, 129, 0.05) 0px, transparent 50%),
              radial-gradient(at 100% 100%, rgba(139, 92, 246, 0.05) 0px, transparent 50%);
            color: var(--text-main);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
            overflow-x: hidden;
          }

          .container {
            width: 100%;
            max-width: 750px;
            background: var(--panel-bg);
            backdrop-filter: blur(16px);
            -webkit-backdrop-filter: blur(16px);
            border: 1px solid var(--border-color);
            border-radius: 24px;
            padding: 40px;
            box-shadow: 0 20px 50px rgba(0, 0, 0, 0.3);
            position: relative;
          }

          .container::before {
            content: '';
            position: absolute;
            top: -2px;
            left: -2px;
            right: -2px;
            bottom: -2px;
            background: linear-gradient(135deg, var(--primary), var(--accent));
            border-radius: 26px;
            z-index: -1;
            opacity: 0.15;
          }

          .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 35px;
            border-bottom: 1px solid var(--border-color);
            padding-bottom: 20px;
          }

          .logo-area {
            display: flex;
            align-items: center;
            gap: 12px;
          }

          .status-pulse {
            width: 10px;
            height: 10px;
            background-color: var(--primary);
            border-radius: 50%;
            box-shadow: 0 0 12px var(--primary);
            animation: pulse 2s infinite;
          }

          @keyframes pulse {
            0% { transform: scale(0.9); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
            70% { transform: scale(1); box-shadow: 0 0 0 10px rgba(16, 185, 129, 0); }
            100% { transform: scale(0.9); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
          }

          h1 {
            font-size: 22px;
            font-weight: 800;
            letter-spacing: -0.5px;
            background: linear-gradient(to right, #ffffff, #d1d5db);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
          }

          .badge {
            background: var(--primary-glow);
            border: 1px solid rgba(16, 185, 129, 0.3);
            color: var(--primary);
            padding: 6px 14px;
            border-radius: 50px;
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 1px;
          }

          .grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 24px;
            margin-bottom: 30px;
          }

          @media (max-width: 600px) {
            .grid { grid-template-columns: 1fr; }
          }

          .card {
            background: rgba(255, 255, 255, 0.02);
            border: 1px solid var(--border-color);
            border-radius: 18px;
            padding: 24px;
            transition: all 0.3s ease;
          }

          .card:hover {
            transform: translateY(-2px);
            border-color: rgba(255, 255, 255, 0.15);
            box-shadow: 0 10px 20px rgba(0, 0, 0, 0.1);
          }

          .card-title {
            font-size: 13px;
            color: var(--text-muted);
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 8px;
          }

          .card-value {
            font-size: 32px;
            font-weight: 800;
            color: var(--text-main);
            letter-spacing: -1px;
          }

          .card-value span {
            font-size: 16px;
            color: var(--text-muted);
            font-weight: 400;
            margin-left: 4px;
          }

          .progress-container {
            margin-top: 15px;
          }

          .progress-bar-bg {
            width: 100%;
            height: 8px;
            background: rgba(255, 255, 255, 0.05);
            border-radius: 4px;
            overflow: hidden;
            margin-bottom: 8px;
          }

          .progress-bar-fill {
            height: 100%;
            background: linear-gradient(90deg, var(--primary), var(--accent));
            border-radius: 4px;
            box-shadow: 0 0 10px var(--primary-glow);
            transition: width 0.5s ease-in-out;
          }

          .progress-labels {
            display: flex;
            justify-content: space-between;
            font-size: 11px;
            color: var(--text-muted);
          }

          .footer {
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-size: 12px;
            color: var(--text-muted);
            border-top: 1px solid var(--border-color);
            padding-top: 20px;
            margin-top: 15px;
          }

          .footer-refresh {
            display: flex;
            align-items: center;
            gap: 6px;
          }

          .refresh-spinner {
            width: 12px;
            height: 12px;
            border: 2px solid rgba(255, 255, 255, 0.1);
            border-top: 2px solid var(--text-muted);
            border-radius: 50%;
            animation: spin 1s linear infinite;
          }

          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo-area">
              <div class="status-pulse"></div>
              <h1>COLDCASE Live Metrics</h1>
            </div>
            <div class="badge">NATIVO MUNIN</div>
          </div>

          <div class="grid">
            <div class="card" style="grid-column: span 2;">
              <div class="card-title">Tiempo Activo de la API (Uptime)</div>
              <div class="card-value" style="color: #60a5fa; background: linear-gradient(to right, #3b82f6, #8b5cf6); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">
                ${uptimeStr}
              </div>
            </div>

            <div class="card">
              <div class="card-title">Memoria Heap (Uso de Motor JS)</div>
              <div class="card-value">${toMB(memory.heapUsed)}<span>MB</span></div>
              <div class="progress-container">
                <div class="progress-bar-bg">
                  <div class="progress-bar-fill" style="width: ${usagePercent}%"></div>
                </div>
                <div class="progress-labels">
                  <span>Uso: ${usagePercent}%</span>
                  <span>Total: ${toMB(memory.heapTotal)} MB</span>
                </div>
              </div>
            </div>

            <div class="card">
              <div class="card-title">Memoria Física (RSS Total)</div>
              <div class="card-value" style="color: #f59e0b;">${toMB(memory.rss)}<span>MB</span></div>
              <p style="font-size: 11px; color: var(--text-muted); margin-top: 15px; line-height: 1.4;">
                Memoria física real asignada por el sistema operativo al proceso Node.js.
              </p>
            </div>
          </div>

          <div class="footer">
            <div>Plataforma: Node.js ${process.version}</div>
            <div class="footer-refresh">
              <div class="refresh-spinner"></div>
              <span>Se actualiza automáticamente cada 5s</span>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;
  }
}

