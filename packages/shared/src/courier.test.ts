import { describe, expect, it } from 'vitest';
import { advanceStopInputSchema, courierLocationInputSchema } from './courier.js';

describe('courier schemas', () => {
  it('requires a reason to fail a stop', () => {
    expect(advanceStopInputSchema.safeParse({ to: 'FAILED' }).success).toBe(false);
    expect(advanceStopInputSchema.safeParse({ to: 'FAILED', failureReason: 'CUSTOMER_ABSENT' }).success).toBe(true);
  });

  it('only accepts 4-digit delivery codes', () => {
    expect(advanceStopInputSchema.safeParse({ to: 'DONE', deliveryCode: '0420' }).success).toBe(true);
    expect(advanceStopInputSchema.safeParse({ to: 'DONE', deliveryCode: '42' }).success).toBe(false);
  });

  it('rejects unknown targets', () => {
    expect(advanceStopInputSchema.safeParse({ to: 'PENDING' }).success).toBe(false);
  });

  it('validates coordinates', () => {
    expect(courierLocationInputSchema.safeParse({ lat: -33.45, lng: -61.48 }).success).toBe(true);
    expect(courierLocationInputSchema.safeParse({ lat: -133, lng: -61.48 }).success).toBe(false);
  });
});
