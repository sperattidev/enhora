import { describe, expect, it } from 'vitest';
import { createJobInputSchema, type StopInput } from './schemas.js';

const at = { lat: -33.4594, lng: -61.4832 };
const pickup: StopInput = { kind: 'PICKUP', address: 'Belgrano 1200', location: at };
const dropoff: StopInput = { kind: 'DROPOFF', address: 'San Martín 850', location: at };

const issues = (input: unknown) => {
  const result = createJobInputSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((i) => i.message);
};

describe('createJobInputSchema', () => {
  it('accepts a simple pickup and delivery with cash', () => {
    expect(issues({ stops: [pickup, { ...dropoff, cashToCollect: 1_500_000 }] })).toEqual([]);
  });

  it('accepts a single errand', () => {
    expect(issues({ stops: [{ kind: 'ERRAND', address: 'Banco Nación', location: at }] })).toEqual([]);
  });

  it('requires goods before a delivery', () => {
    expect(issues({ stops: [dropoff] })).toContain('Una entrega necesita un retiro o compra antes');
  });

  it('only lets deliveries collect cash', () => {
    expect(issues({ stops: [{ ...pickup, cashToCollect: 100 }, dropoff] })).toContain(
      'Solo las entregas pueden cobrar',
    );
  });

  it('requires a spending cap on purchases', () => {
    expect(issues({ stops: [{ kind: 'PURCHASE', address: 'Farmacia', location: at }, dropoff] })).toContain(
      'Una compra necesita monto máximo',
    );
  });

  it('rejects fractional cents', () => {
    expect(issues({ stops: [pickup, { ...dropoff, cashToCollect: 10.5 }] }).length).toBeGreaterThan(0);
  });

  it('rejects more than 10 stops', () => {
    expect(issues({ stops: [pickup, ...Array.from({ length: 10 }, () => dropoff)] }).length).toBeGreaterThan(0);
  });

  it('rejects a schedule in the past', () => {
    expect(issues({ stops: [pickup, dropoff], scheduledFor: '2020-01-01T10:00:00Z' })).toContain(
      'La fecha programada ya pasó',
    );
  });

  it('validates Argentine phones', () => {
    expect(issues({ stops: [pickup, { ...dropoff, contactPhone: '+5493465123456' }] })).toEqual([]);
    expect(issues({ stops: [pickup, { ...dropoff, contactPhone: '3465123456' }] }).length).toBeGreaterThan(0);
  });
});
