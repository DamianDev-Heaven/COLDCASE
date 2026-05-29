import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      const allowedOriginsEnv = process.env.ALLOWED_ORIGINS;
      const allowedOrigins = allowedOriginsEnv
        ? allowedOriginsEnv.split(',').map((o) => o.trim())
        : [
            'http://ccase.tech',
            'https://ccase.tech',
            'http://www.ccase.tech',
            'https://www.ccase.tech',
            'http://api.ccase.tech',
            'https://api.ccase.tech',
            'http://localhost:3001',
            'http://localhost:3000',
            'http://104.64.127.24',
            'http://104.64.127.23',
            'http://104.64.127.23:3000',
          ];
      if (!origin || allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(new Error(`Blocked by CORS: ${origin}`), false);
      }
    },
    credentials: true,
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
