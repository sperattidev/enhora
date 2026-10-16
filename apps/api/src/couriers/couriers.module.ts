import { Module } from '@nestjs/common';
import { CourierContextService } from './courier-context.js';
import { CouriersController } from './couriers.controller.js';
import { CouriersService } from './couriers.service.js';

@Module({
  controllers: [CouriersController],
  providers: [CouriersService, CourierContextService],
})
export class CouriersModule {}
