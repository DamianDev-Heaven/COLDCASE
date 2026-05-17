import { Module } from "@nestjs/common";
import { IaController } from "./ia.controller";
import { IaAnalysisService } from "./ia-analysis.service";
import { IaService } from "./ia.service";

@Module({
  controllers: [IaController],
  providers: [IaService, IaAnalysisService],
})
export class IaModule {}