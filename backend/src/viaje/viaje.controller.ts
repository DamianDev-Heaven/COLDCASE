import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { CreateViajeDto } from "./dto/create-viaje.dto";
import { ViajeService } from "./viaje.service";

@Controller("viaje")
export class ViajeController {
  constructor(private readonly viajeService: ViajeService) {}

  @Post()
  create(@Body() body: CreateViajeDto) {
    return this.viajeService.create(body);
  }

  @Get()
  findAll() {
    return this.viajeService.findAll();
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.viajeService.findOne(id);
  }
}
