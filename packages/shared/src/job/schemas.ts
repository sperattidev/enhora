import { z } from 'zod';
import { JOB_STATUSES } from './status.js';
import { STOP_KINDS } from './stop.js';

export const MAX_STOPS = 10;
const MAX_SCHEDULE_AHEAD_MS = 14 * 24 * 60 * 60 * 1000;

/** Integer amount in cents. */
export const centsSchema = z.number().int().nonnegative().max(1_000_000_000_00);

export const pointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
export type Point = z.infer<typeof pointSchema>;

/** Argentine phone in E.164 (+54...). */
export const phoneSchema = z.string().regex(/^\+54\d{10,11}$/, 'Teléfono inválido (formato +54...)');

export const stopInputSchema = z
  .object({
    kind: z.enum(STOP_KINDS),
    address: z.string().trim().min(3).max(200),
    location: pointSchema,
    contactName: z.string().trim().min(1).max(80).optional(),
    contactPhone: phoneSchema.optional(),
    instructions: z.string().trim().max(500).optional(),
    cashToCollect: centsSchema.optional(),
    maxSpend: centsSchema.optional(),
  })
  .superRefine((stop, ctx) => {
    if (stop.cashToCollect !== undefined && stop.kind !== 'DROPOFF') {
      ctx.addIssue({ code: 'custom', path: ['cashToCollect'], message: 'Solo las entregas pueden cobrar' });
    }
    if (stop.kind === 'PURCHASE' && stop.maxSpend === undefined) {
      ctx.addIssue({ code: 'custom', path: ['maxSpend'], message: 'Una compra necesita monto máximo' });
    }
    if (stop.maxSpend !== undefined && stop.kind !== 'PURCHASE') {
      ctx.addIssue({ code: 'custom', path: ['maxSpend'], message: 'Solo las compras tienen monto máximo' });
    }
  });
export type StopInput = z.infer<typeof stopInputSchema>;

export const createJobInputSchema = z
  .object({
    stops: z.array(stopInputSchema).min(1).max(MAX_STOPS),
    scheduledFor: z.coerce.date().optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .superRefine((job, ctx) => {
    let hasGoods = false;
    job.stops.forEach((stop, i) => {
      if (stop.kind === 'PICKUP' || stop.kind === 'PURCHASE') hasGoods = true;
      if (stop.kind === 'DROPOFF' && !hasGoods) {
        ctx.addIssue({
          code: 'custom',
          path: ['stops', i, 'kind'],
          message: 'Una entrega necesita un retiro o compra antes',
        });
      }
    });
    if (job.scheduledFor && job.scheduledFor.getTime() < Date.now()) {
      ctx.addIssue({ code: 'custom', path: ['scheduledFor'], message: 'La fecha programada ya pasó' });
    }
    if (job.scheduledFor && job.scheduledFor.getTime() > Date.now() + MAX_SCHEDULE_AHEAD_MS) {
      ctx.addIssue({ code: 'custom', path: ['scheduledFor'], message: 'Se puede programar hasta 14 días antes' });
    }
  });
export type CreateJobInput = z.infer<typeof createJobInputSchema>;

export const cancelJobInputSchema = z.object({
  reason: z.string().trim().min(3).max(300),
});
export type CancelJobInput = z.infer<typeof cancelJobInputSchema>;

export const listJobsQuerySchema = z.object({
  status: z.enum(JOB_STATUSES).optional(),
  /** Cursor: return jobs created strictly before this instant. */
  before: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type ListJobsQuery = z.infer<typeof listJobsQuerySchema>;

/** Optional `Idempotency-Key` header value. */
export const idempotencyKeySchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_-]{8,64}$/, 'Idempotency-Key inválida');
