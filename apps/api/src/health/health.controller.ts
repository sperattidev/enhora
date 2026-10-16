import { Controller, Get, HttpCode, Inject, ServiceUnavailableException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { sql } from 'drizzle-orm';
import { Public } from '../auth/decorators.js';
import { DB, type Database } from '../db/db.module.js';

@Public()
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(@Inject(DB) private readonly db: Database) {}

  /** Liveness: the process is up. */
  @Get()
  @HttpCode(200)
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  /** Readiness: dependencies answer. Used by the deploy to decide when to route traffic. */
  @Get('ready')
  async ready(): Promise<{ status: 'ok'; database: 'up' }> {
    try {
      await this.db.execute(sql`select 1`);
    } catch {
      throw new ServiceUnavailableException({ status: 'error', database: 'down' });
    }
    return { status: 'ok', database: 'up' };
  }
}
