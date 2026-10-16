import { describe, expect, it } from 'vitest';
import { emptyStop, isQuotable, toPayload, validate, type JobDraft } from './new-job-form';

const at = { lat: -33.4594, lng: -61.4832 };

function draft(over: Partial<JobDraft> = {}): JobDraft {
  return {
    stops: [emptyStop('PICKUP', 'Belgrano 1200', at), { ...emptyStop('DROPOFF', 'San Martín 850', at) }],
    scheduled: false,
    scheduledFor: '',
    notes: '',
    ...over,
  };
}

describe('new job form', () => {
  it('builds a valid payload with cash in cents and a normalized phone', () => {
    const d = draft();
    d.stops[1] = { ...d.stops[1]!, cash: '1.250', contactPhone: '3465 12-3456' };
    const result = validate(d);
    expect('data' in result && result.data.stops[1]).toMatchObject({
      cashToCollect: 125_000,
      contactPhone: '+5493465123456',
    });
  });

  it('asks to mark the map when a stop has no location', () => {
    const d = draft();
    d.stops[1] = { ...d.stops[1]!, location: null };
    const result = validate(d);
    expect('errors' in result && result.errors.stops[1]?.location).toBe('Marcá el lugar en el mapa');
    expect(isQuotable(d)).toBe(false);
  });

  it('flags a delivery with no pickup before it', () => {
    const d = draft({ stops: [emptyStop('DROPOFF', 'San Martín 850', at)] });
    const result = validate(d);
    expect('errors' in result && result.errors.stops[0]?.kind).toBe('Una entrega necesita un retiro o compra antes');
  });

  it('rejects unreadable amounts instead of sending zero', () => {
    const d = draft();
    d.stops[1] = { ...d.stops[1]!, cash: 'mil' };
    const result = validate(d);
    expect('errors' in result && result.errors.stops[1]?.cashToCollect).toBe('Monto inválido');
  });

  it('only sends cash for deliveries and spending caps for purchases', () => {
    const d = draft();
    d.stops[0] = { ...d.stops[0]!, cash: '500', maxSpend: '900' };
    const payload = toPayload(d) as { stops: Record<string, unknown>[] };
    expect(payload.stops[0]).not.toHaveProperty('cashToCollect', expect.anything());
    expect(payload.stops[0]?.maxSpend).toBeUndefined();
  });

  it('requires a date when scheduling', () => {
    const result = validate(draft({ scheduled: true }));
    expect('errors' in result && result.errors.form).toBe('Elegí fecha y hora para programar');
  });

  it('is quotable once every stop has address and location', () => {
    expect(isQuotable(draft())).toBe(true);
  });
});
