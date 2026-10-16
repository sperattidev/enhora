import { describe, expect, it } from 'vitest';
import { createZoneInputSchema, updateZoneInputSchema, zoneGeometrySchema } from './zone.js';

const square = [
  [
    [-61.5, -33.48],
    [-61.46, -33.48],
    [-61.46, -33.44],
    [-61.5, -33.44],
    [-61.5, -33.48],
  ],
];

describe('zone schemas', () => {
  it('accepts a closed polygon', () => {
    expect(zoneGeometrySchema.safeParse({ type: 'Polygon', coordinates: square }).success).toBe(true);
  });

  it('accepts a multipolygon', () => {
    expect(zoneGeometrySchema.safeParse({ type: 'MultiPolygon', coordinates: [square] }).success).toBe(true);
  });

  it('rejects an open ring', () => {
    const open = [square[0]!.slice(0, 4).concat([[-61.49, -33.47]])];
    expect(zoneGeometrySchema.safeParse({ type: 'Polygon', coordinates: open }).success).toBe(false);
  });

  it('rejects coordinates out of range', () => {
    const bad = [square[0]!.map(([lng, lat]) => [lng! * 10, lat!])];
    expect(zoneGeometrySchema.safeParse({ type: 'Polygon', coordinates: bad }).success).toBe(false);
  });

  it('requires a positive fee', () => {
    const zone = { citySlug: 'firmat', name: 'Centro', feeCents: 0, area: { type: 'Polygon', coordinates: square } };
    expect(createZoneInputSchema.safeParse(zone).success).toBe(false);
  });

  it('refuses empty updates', () => {
    expect(updateZoneInputSchema.safeParse({}).success).toBe(false);
    expect(updateZoneInputSchema.safeParse({ active: false }).success).toBe(true);
  });
});
