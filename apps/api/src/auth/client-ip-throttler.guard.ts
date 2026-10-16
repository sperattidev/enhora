import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { FastifyRequest } from 'fastify';

/**
 * Rate-limits by the client IP Fastify resolves through the trusted proxies (`req.ip`),
 * never by the socket address, which behind Caddy is the same for every user.
 */
@Injectable()
export class ClientIpThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(req: Record<string, unknown>): Promise<string> {
    return (req as unknown as FastifyRequest).ip;
  }
}
