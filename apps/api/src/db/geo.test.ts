import { describe, expect, it } from 'vitest';
import { parseEwkbPoint } from './geo.js';

describe('parseEwkbPoint', () => {
  it('reads a little-endian EWKB point with SRID 4326', () => {
    // SELECT ST_SetSRID(ST_MakePoint(-61.4832, -33.4594), 4326)
    const buf = Buffer.alloc(25);
    buf.writeUInt8(1, 0);
    buf.writeUInt32LE(0x20000001, 1);
    buf.writeUInt32LE(4326, 5);
    buf.writeDoubleLE(-61.4832, 9);
    buf.writeDoubleLE(-33.4594, 17);
    expect(parseEwkbPoint(buf.toString('hex'))).toEqual({ lng: -61.4832, lat: -33.4594 });
  });

  it('reads a big-endian WKB point without SRID', () => {
    const buf = Buffer.alloc(21);
    buf.writeUInt8(0, 0);
    buf.writeUInt32BE(1, 1);
    buf.writeDoubleBE(1.5, 5);
    buf.writeDoubleBE(2.5, 13);
    expect(parseEwkbPoint(buf.toString('hex'))).toEqual({ lng: 1.5, lat: 2.5 });
  });

  it('rejects other geometry types', () => {
    const buf = Buffer.alloc(9);
    buf.writeUInt8(1, 0);
    buf.writeUInt32LE(3, 1);
    expect(() => parseEwkbPoint(buf.toString('hex'))).toThrow('not a point');
  });
});
