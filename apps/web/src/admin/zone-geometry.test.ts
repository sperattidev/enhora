import { zoneGeometrySchema } from '@enhora/shared';
import { describe, expect, it } from 'vitest';
import type { Zone } from './types';
import { draftFeatures, draftPolygon, zonesBounds } from './zone-geometry';

const points = [
  { lat: -33.47, lng: -61.5 },
  { lat: -33.47, lng: -61.46 },
  { lat: -33.44, lng: -61.46 },
];

describe('zone drawing', () => {
  it('needs three points for a polygon', () => {
    expect(draftPolygon(points.slice(0, 2))).toBeNull();
  });

  it('closes the ring and passes the API validation', () => {
    const polygon = draftPolygon(points)!;
    expect(polygon.coordinates[0]).toHaveLength(4);
    expect(polygon.coordinates[0]![0]).toEqual(polygon.coordinates[0]![3]);
    expect(zoneGeometrySchema.safeParse(polygon).success).toBe(true);
  });

  it('draws a line while only two points exist', () => {
    const fc = draftFeatures(points.slice(0, 2));
    expect(fc.features.map((f) => f.geometry.type)).toEqual(['LineString', 'Point', 'Point']);
  });

  it('frames only active zones', () => {
    const zone = (active: boolean, lng: number): Zone => ({
      id: String(lng),
      name: 'z',
      feeCents: 1,
      active,
      area: {
        type: 'MultiPolygon',
        coordinates: [
          [
            [
              [lng, -33.5],
              [lng + 0.1, -33.5],
              [lng + 0.1, -33.4],
              [lng, -33.5],
            ],
          ],
        ],
      },
    });
    expect(zonesBounds([zone(true, -61.5), zone(false, -60)])).toEqual([
      [-61.5, -33.5],
      [-61.4, -33.4],
    ]);
    expect(zonesBounds([zone(false, -60)])).toBeNull();
  });
});
