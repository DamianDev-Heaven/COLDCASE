import {
  BadRequestException,
  Body,
  Controller,
  Delete,
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
import { RolesGuard } from './roles.guard';
import { Roles } from './roles.decorator';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { Throttle } from '@nestjs/throttler';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @UseGuards(AuthGuard, RolesGuard)
  @Roles('Admin')
  @Post('register')
  register(@Body() body: RegisterDto) {
    return this.authService.register(body.email, body.password, body.rol);
  }

  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('login')
  login(@Body() body: LoginDto) {
    return this.authService.login(body.email, body.password);
  }

  @UseGuards(AuthGuard)
  @Get('me')
  me(@Req() request: Request & { user?: unknown }) {
    return { user: request.user ?? null };
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles('Admin')
  @Get('users')
  users() {
    return this.authService.listUsers();
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles('Admin')
  @Patch('users/:id')
  updateUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateUserDto,
  ) {
    if (!body.email && !body.password && !body.rol) {
      throw new BadRequestException(
        'Debes enviar al menos un campo para actualizar.',
      );
    }

    return this.authService.updateUser(id, body);
  }

  @UseGuards(AuthGuard, RolesGuard)
  @Roles('Admin')
  @Delete('users/:id')
  deleteUser(
    @Req() request: Request & { user?: { sub?: string } },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.authService.deleteUser(id, request.user?.sub);
  }
}
