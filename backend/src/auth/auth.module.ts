import { Logger, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET') ?? 'change-me',
        signOptions: { expiresIn: '8h' },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthGuard],
})
export class AuthModule {
  private readonly logger = new Logger(AuthModule.name);

  constructor() {
    if (!process.env.JWT_SECRET) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error(
          'FATAL: La variable de entorno JWT_SECRET es requerida en producción.',
        );
      } else {
        this.logger.warn(
          'ADVERTENCIA: JWT_SECRET no está configurada. Usando valor por defecto inseguro "change-me" para desarrollo.',
        );
      }
    }
  }
}
