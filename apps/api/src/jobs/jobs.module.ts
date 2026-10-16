import { Module } from '@nestjs/common';
import { ZonesModule } from '../zones/zones.module.js';
import { JobsController } from './jobs.controller.js';
import { JobsService } from './jobs.service.js';
import { MerchantContextService } from './merchant-context.js';
import { TrackingController } from './tracking.controller.js';

@Module({
  imports: [ZonesModule],
  controllers: [JobsController, TrackingController],
  providers: [JobsService, MerchantContextService],
})
export class JobsModule {}
