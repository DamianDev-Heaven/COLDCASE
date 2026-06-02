import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EmpresaController } from './empresa.controller';
import { EmpresaService } from './empresa.service';

@Module({
  imports: [AuthModule],
  controllers: [EmpresaController],
  providers: [EmpresaService],
})
export class EmpresaModule {}
