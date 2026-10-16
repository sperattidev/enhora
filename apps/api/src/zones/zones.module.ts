import { Module } from '@nestjs/common';
import { ZonesController } from './zones.controller.js';
import { ZonesService } from './zones.service.js';

@Module({
  controllers: [ZonesController],
  providers: [ZonesService],
  exports: [ZonesService],
})
export class ZonesModule {}
