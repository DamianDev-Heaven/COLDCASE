import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Groq from 'groq-sdk';
import { ZepClient } from '@getzep/zep-cloud';
import { IaController } from './ia.controller';
import { IaAnalysisService } from './ia-analysis.service';
import { IaService } from './ia.service';

@Module({
  controllers: [IaController],
  providers: [
    IaService,
    IaAnalysisService,
    {
      provide: 'GROQ_CLIENT',
      useFactory: (config: ConfigService): Groq | null => {
        const apiKey =
          config.get<string>('GROQ_API_KEY') ??
          config.get<string>('LLM_API_KEY');
        if (!apiKey) {
          return null;
        }
        return new Groq({ apiKey });
      },
      inject: [ConfigService],
    },
    {
      provide: 'ZEP_CLIENT',
      useFactory: (config: ConfigService): ZepClient | null => {
        const apiKey = config.get<string>('ZEP_API_KEY');
        if (!apiKey) {
          return null;
        }
        const environment = config.get<string>('ZEP_API_URL');
        return environment
          ? new ZepClient({ apiKey, environment })
          : new ZepClient({ apiKey });
      },
      inject: [ConfigService],
    },
  ],
  exports: [IaAnalysisService],
})
export class IaModule {}
