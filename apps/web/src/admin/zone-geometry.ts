import type { LatLng } from '@enhora/ui/map';
import type { Zone } from './types';

/** Closed GeoJSON polygon from the points clicked so far, or null with fewer than 3. */
export function draftPolygon(points: readonly LatLng[]): GeoJSON.Polygon | null {
  if (points.length < 3) return null;
  const ring = points.map((p) => [p.lng, p.lat]);
  return { type: 'Polygon', coordinates: [[...ring, ring[0]!]] };
}

/** Everything the editor draws for the polygon being created: area, outline and vertices. */
export function draftFeatures(points: readonly LatLng[]): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = points.map((p, i) => ({
    type: 'Feature',
    properties: { index: i + 1 },
    geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
  }));
  const polygon = draftPolygon(points);
  if (polygon) features.unshift({ type: 'Feature', properties: {}, geometry: polygon });
  else if (points.length === 2) {
    features.unshift({
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: points.map((p) => [p.lng, p.lat]) },
    });
  }
  return { type: 'FeatureCollection', features };
}

export function zonesFeatures(zones: readonly Zone[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: zones.map((z) => ({
      type: 'Feature',
      id: z.id,
      properties: { name: z.name, active: z.active },
      geometry: z.area,
    })),
  };
}

/** Bounding box of every active zone, to frame the map; null when there are none. */
export function zonesBounds(zones: readonly Zone[]): [[number, number], [number, number]] | null {
  const coords = zones.filter((z) => z.active).flatMap((z) => z.area.coordinates.flat(2) as unknown as number[][]);
  if (coords.length === 0) return null;
  const lngs = coords.map((c) => c[0]!);
  const lats = coords.map((c) => c[1]!);
  return [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ];
}
