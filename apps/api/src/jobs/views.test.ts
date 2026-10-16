import { describe, expect, it } from 'vitest';
import { newDeliveryCode, newTrackingToken } from './codes.js';
import { toTrackingView, type TrackingSource } from './views.js';

const base: TrackingSource = {
  status: 'IN_PROGRESS',
  merchantName: 'La Esquina',
  courierFullName: '  Juan Carlos Pérez ',
  scheduledFor: null,
  createdAt: new Date('2026-10-15T12:00:00Z'),
  completedAt: null,
  cancelledAt: null,
  stops: [
    { kind: 'PICKUP', status: 'DONE' },
    { kind: 'DROPOFF', status: 'EN_ROUTE' },
  ],
};

describe('toTrackingView', () => {
  it('shows only the courier first name', () => {
    expect(toTrackingView(base, new Date())?.courierName).toBe('Juan');
  });

  it('exposes nothing beyond the allowed fields', () => {
    const view = toTrackingView(
      { ...base, stops: [{ kind: 'DROPOFF', status: 'DONE', address: 'secreta' } as never] },
      new Date(),
    );
    expect(JSON.stringify(view)).not.toContain('secreta');
  });

  it('keeps working for 24 hours after completion', () => {
    const completedAt = new Date('2026-10-15T13:00:00Z');
    const job = { ...base, status: 'COMPLETED' as const, completedAt };
    expect(toTrackingView(job, new Date('2026-10-16T12:59:00Z'))).not.toBeNull();
    expect(toTrackingView(job, new Date('2026-10-16T13:01:00Z'))).toBeNull();
  });

  it('also expires after cancellation', () => {
    const job = { ...base, status: 'CANCELLED' as const, cancelledAt: new Date('2026-10-15T13:00:00Z') };
    expect(toTrackingView(job, new Date('2026-10-17T00:00:00Z'))).toBeNull();
  });
});

describe('codes', () => {
  it('delivery codes are always 4 digits', () => {
    for (let i = 0; i < 500; i++) expect(newDeliveryCode()).toMatch(/^\d{4}$/);
  });

  it('tracking tokens are long and unique', () => {
    const tokens = new Set(Array.from({ length: 200 }, newTrackingToken));
    expect(tokens.size).toBe(200);
    for (const t of tokens) expect(t).toMatch(/^[A-Za-z0-9_-]{32}$/);
  });
});
