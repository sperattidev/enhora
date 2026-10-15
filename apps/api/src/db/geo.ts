import { sql } from 'drizzle-orm';
import { customType } from 'drizzle-orm/pg-core';

export interface LngLat {
  lng: number;
  lat: number;
}

const SRID_FLAG = 0x20000000;

/** Parses a hex EWKB point as returned by PostGIS for `geometry(Point, 4326)` columns. */
export function parseEwkbPoint(hex: string): LngLat {
  const buf = Buffer.from(hex, 'hex');
  const littleEndian = buf.readUInt8(0) === 1;
  const type = littleEndian ? buf.readUInt32LE(1) : buf.readUInt32BE(1);
  if ((type & 0xff) !== 1) throw new Error('EWKB value is not a point');
  const offset = type & SRID_FLAG ? 9 : 5;
  const read = (at: number) => (littleEndian ? buf.readDoubleLE(at) : buf.readDoubleBE(at));
  return { lng: read(offset), lat: read(offset + 8) };
}

/** WGS84 point. Drizzle's built-in geometry type drops the SRID, which breaks spatial joins with zones. */
export const point = customType<{ data: LngLat; driverData: string }>({
  dataType: () => 'geometry(Point, 4326)',
  toDriver: ({ lng, lat }) => sql`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)`,
  fromDriver: parseEwkbPoint,
});

/** WGS84 multipolygon, written and read as GeoJSON through ST_GeomFromGeoJSON / ST_AsGeoJSON. */
export const multiPolygon = customType<{ data: string }>({
  dataType: () => 'geometry(MultiPolygon, 4326)',
});
