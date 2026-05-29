import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from './auth.service';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext) {
    const request = context
      .switchToHttp()
      .getRequest<Request & { cookies?: unknown }>();
    const authHeader = request.headers.authorization;
    let token: string | undefined;

    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.slice('Bearer '.length);
    } else if (request.query && request.query.token) {
      token = request.query.token as string;
    } else if (request.cookies) {
      const cookies = request.cookies as Record<string, string | undefined>;
      token = cookies.access_token;
    }

    if (!token) {
      throw new UnauthorizedException('Token requerido.');
    }

    try {
      const payload = await this.authService.verifyToken(token);
      (request as Request & { user?: unknown }).user = payload;
      return true;
    } catch {
      throw new UnauthorizedException('Token invalido.');
    }
  }
}
