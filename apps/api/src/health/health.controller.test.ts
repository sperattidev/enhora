import { ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import { DB } from '../db/db.module.js';
import { HealthController } from './health.controller.js';

async function controllerWith(execute: () => Promise<unknown>) {
  const moduleRef = await Test.createTestingModule({
    controllers: [HealthController],
    providers: [{ provide: DB, useValue: { execute: vi.fn(execute) } }],
  }).compile();
  return moduleRef.get(HealthController);
}

describe('HealthController', () => {
  it('reports liveness without touching the database', async () => {
    const controller = await controllerWith(() => Promise.reject(new Error('down')));
    expect(controller.live()).toEqual({ status: 'ok' });
  });

  it('is ready when the database answers', async () => {
    const controller = await controllerWith(() => Promise.resolve([]));
    await expect(controller.ready()).resolves.toEqual({ status: 'ok', database: 'up' });
  });

  it('returns 503 when the database is down', async () => {
    const controller = await controllerWith(() => Promise.reject(new Error('connection refused')));
    await expect(controller.ready()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
