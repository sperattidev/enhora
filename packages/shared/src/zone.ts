import { z } from 'zod';
import { centsSchema } from './job/schemas.js';

const position = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);

/** A closed ring: at least 4 positions, first and last equal. */
const ring = z
  .array(position)
  .min(4)
  .max(2_000)
  .refine((r) => r[0]![0] === r.at(-1)![0] && r[0]![1] === r.at(-1)![1], 'El anillo debe cerrarse');

/** GeoJSON Polygon or MultiPolygon in WGS84 (lng, lat). */
export const zoneGeometrySchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('Polygon'), coordinates: z.array(ring).min(1).max(20) }),
  z.object({ type: z.literal('MultiPolygon'), coordinates: z.array(z.array(ring).min(1).max(20)).min(1).max(50) }),
]);
export type ZoneGeometry = z.infer<typeof zoneGeometrySchema>;

export const createZoneInputSchema = z.object({
  citySlug: z.string().trim().min(2).max(60),
  name: z.string().trim().min(2).max(60),
  feeCents: centsSchema.refine((v) => v > 0, 'La tarifa debe ser mayor a cero'),
  area: zoneGeometrySchema,
});
export type CreateZoneInput = z.infer<typeof createZoneInputSchema>;

export const updateZoneInputSchema = z
  .object({
    name: z.string().trim().min(2).max(60).optional(),
    feeCents: centsSchema.refine((v) => v > 0, 'La tarifa debe ser mayor a cero').optional(),
    active: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nada para actualizar');
export type UpdateZoneInput = z.infer<typeof updateZoneInputSchema>;

export const pricingRulesInputSchema = z.object({
  extraStopFeeCents: centsSchema,
  errandFeeCents: centsSchema,
  surchargeBps: z.number().int().min(0).max(10_000),
  roundToCents: z.number().int().min(0).max(100_000),
  freeWaitMinutes: z.number().int().min(0).max(120),
  waitFeePerMinuteCents: centsSchema,
});
export type PricingRulesInput = z.infer<typeof pricingRulesInputSchema>;
