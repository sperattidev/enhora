import 'reflect-metadata';
import helmet from '@fastify/helmet';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module.js';
import { loadEnv } from './config/env.js';

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const adapter = new FastifyAdapter({
    // Cloudflare and Caddy sit in front; trust them for the client IP used by rate limiting.
    trustProxy: true,
    bodyLimit: 1_048_576,
    logger: { level: env.LOG_LEVEL, redact: ['req.headers.authorization', 'req.headers.cookie'] },
  });
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter);

  await app.register(helmet);
  app.enableCors({ origin: env.CORS_ORIGINS, credentials: true });
  app.enableShutdownHooks();

  await app.listen(env.PORT, '0.0.0.0');
}

void bootstrap();
