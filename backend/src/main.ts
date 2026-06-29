import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      const allowedOriginsEnv =
        process.env.ALLOWED_ORIGINS ||
        'http://localhost:3001,http://localhost:3000';
      const allowedOrigins = allowedOriginsEnv.split(',').map((o) => o.trim());

      // Permitir peticiones sin origen (como clientes REST tipo Postman o cURL)
      // y peticiones cuyos orígenes estén en la lista blanca.
      if (!origin || allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(new Error(`Blocked by CORS: ${origin}`), false);
      }
    },
    credentials: true,
  });

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          ...helmet.contentSecurityPolicy.getDefaultDirectives(),
          'script-src': ["'self'", "'unsafe-inline'", 'https://unpkg.com'],
          'script-src-attr': ["'unsafe-inline'"],
          'style-src': [
            "'self'",
            "'unsafe-inline'",
            'https://fonts.googleapis.com',
            'https://unpkg.com',
          ],
          'img-src': [
            "'self'",
            'data:',
            'https://unpkg.com',
            'https://*.tile.openstreetmap.org',
          ],
          'upgrade-insecure-requests': null,
        },
      },
      referrerPolicy: {
        policy: 'strict-origin-when-cross-origin',
      },
    }),
  );
  app.use(cookieParser());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Configuración de Swagger
  const config = new DocumentBuilder()
    .setTitle('Coldcase API')
    .setDescription('API de Misión Crítica para Monitoreo Logístico')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const documentFactory = () => SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, documentFactory);

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
