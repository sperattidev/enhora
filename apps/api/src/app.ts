import 'reflect-metadata';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module.js';
import type { Env } from './config/env.js';

/** Builds the fully configured app. Shared by the server entrypoint and the e2e tests. */
export async function createApp(env: Env, options: { logger?: boolean } = {}): Promise<NestFastifyApplication> {
  const logging = options.logger !== false;
  const adapter = new FastifyAdapter({
    // Cloudflare and Caddy sit in front; trust them for the client IP used by rate limiting.
    trustProxy: true,
    bodyLimit: 1_048_576,
    logger: logging && { level: env.LOG_LEVEL, redact: ['req.headers.authorization', 'req.headers.cookie'] },
  });
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule.forRoot(env),
    adapter,
    logging ? {} : { logger: false },
  );

  await app.register(helmet);
  await app.register(cookie);
  app.enableCors({ origin: env.CORS_ORIGINS, credentials: true });
  app.enableShutdownHooks();
  return app;
}
