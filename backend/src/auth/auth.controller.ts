import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @UseGuards(AuthGuard)
  @Post('register')
  register(
    @Req() request: Request & { user?: { rol?: string } },
    @Body() body: RegisterDto,
  ) {
    if (request.user?.rol !== 'Admin') {
      throw new ForbiddenException(
        'Solo el administrador puede registrar usuarios.',
      );
    }

    return this.authService.register(body.email, body.password, body.rol);
  }

  @Post('login')
  login(@Body() body: LoginDto) {
    return this.authService.login(body.email, body.password);
  }

  @UseGuards(AuthGuard)
  @Get('me')
  me(@Req() request: Request & { user?: unknown }) {
    return { user: request.user ?? null };
  }

  @UseGuards(AuthGuard)
  @Get('users')
  users(@Req() request: Request & { user?: { rol?: string } }) {
    if (request.user?.rol !== 'Admin') {
      throw new ForbiddenException('Solo el administrador puede ver usuarios.');
    }

    return this.authService.listUsers();
  }

  @UseGuards(AuthGuard)
  @Patch('users/:id')
  updateUser(
    @Req() request: Request & { user?: { rol?: string } },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateUserDto,
  ) {
    if (request.user?.rol !== 'Admin') {
      throw new ForbiddenException(
        'Solo el administrador puede editar usuarios.',
      );
    }

    if (!body.email && !body.password && !body.rol) {
      throw new BadRequestException(
        'Debes enviar al menos un campo para actualizar.',
      );
    }

    return this.authService.updateUser(id, body);
  }

  @UseGuards(AuthGuard)
  @Delete('users/:id')
  deleteUser(
    @Req() request: Request & { user?: { rol?: string; sub?: string } },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    if (request.user?.rol !== 'Admin') {
      throw new ForbiddenException(
        'Solo el administrador puede eliminar usuarios.',
      );
    }

    return this.authService.deleteUser(id, request.user?.sub);
  }
}
