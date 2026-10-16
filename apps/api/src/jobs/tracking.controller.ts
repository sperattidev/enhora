import { Controller, Get, Header, NotFoundException, Param } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/decorators.js';
import { JobsService } from './jobs.service.js';

const TOKEN = /^[A-Za-z0-9_-]{32}$/;

/** Public page data behind the link the merchant shares by WhatsApp. */
@Public()
@Controller('t')
export class TrackingController {
  constructor(private readonly jobs: JobsService) {}

  @Get(':token')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Header('Cache-Control', 'no-store')
  @Header('X-Robots-Tag', 'noindex')
  track(@Param('token') token: string) {
    if (!TOKEN.test(token)) throw new NotFoundException('Seguimiento inexistente o vencido');
    return this.jobs.track(token);
  }
}
