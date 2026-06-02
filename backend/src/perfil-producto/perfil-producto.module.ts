import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PerfilProductoController } from './perfil-producto.controller';
import { PerfilProductoService } from './perfil-producto.service';

@Module({
  imports: [AuthModule],
  controllers: [PerfilProductoController],
  providers: [PerfilProductoService],
  exports: [PerfilProductoService],
})
export class PerfilProductoModule {}
