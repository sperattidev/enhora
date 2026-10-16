import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { ENV, type Env } from '../config/env.js';
import { DispatchService } from './dispatch.service.js';

/** Drives the dispatcher on a fixed interval. Ticks never overlap. */
@Injectable()
export class DispatchWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(DispatchWorker.name);
  private timer: NodeJS.Timeout | undefined;
  private running: Promise<void> | undefined;

  constructor(
    private readonly dispatch: DispatchService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.env.DISPATCH_ENABLED) return;
    this.timer = setInterval(() => void this.runOnce(), this.env.DISPATCH_INTERVAL_MS);
    this.logger.log(`Dispatcher running every ${this.env.DISPATCH_INTERVAL_MS} ms`);
  }

  async onApplicationShutdown(): Promise<void> {
    clearInterval(this.timer);
    await this.running;
  }

  private async runOnce(): Promise<void> {
    if (this.running) return;
    this.running = this.dispatch
      .tick()
      .then((r) => {
        if (r.offered || r.expiredJobs || r.activated || r.expiredOffers) this.logger.log(r);
      })
      .catch((error: Error) => this.logger.error(`Dispatch tick failed: ${error.message}`))
      .finally(() => {
        this.running = undefined;
      });
    await this.running;
  }
}
