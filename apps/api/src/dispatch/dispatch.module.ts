import { Module } from '@nestjs/common';
import { DispatchService } from './dispatch.service.js';
import { DispatchWorker } from './dispatch.worker.js';

@Module({
  providers: [DispatchService, DispatchWorker],
  exports: [DispatchService],
})
export class DispatchModule {}
