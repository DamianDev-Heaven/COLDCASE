import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { Request } from "express";
import { AuthService } from "./auth.service";
import { AuthGuard } from "./auth.guard";
import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("register")
  register(@Body() body: RegisterDto) {
    return this.authService.register(body.email, body.password, body.rol);
  }

  @Post("login")
  login(@Body() body: LoginDto) {
    return this.authService.login(body.email, body.password);
  }

  @UseGuards(AuthGuard)
  @Get("me")
  me(@Req() request: Request & { user?: unknown }) {
    return { user: request.user ?? null };
  }
}
