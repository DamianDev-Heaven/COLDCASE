import { Body, Controller, Get, Post } from '@nestjs/common';
import { CreateIotDto } from './dto/create-iot.dto';
import { IotService } from './iot.service';

@Controller('iot')
export class IotController {
  constructor(private readonly iotService: IotService) {}

  @Post()
  create(@Body() body: CreateIotDto) {
    return this.iotService.create(body);
  }

  @Get()
  findAll() {
    return this.iotService.findAll();
  }
}
