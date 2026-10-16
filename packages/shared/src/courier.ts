import { z } from 'zod';
import { pointSchema } from './job/schemas.js';
import { STOP_FAILURE_REASONS } from './job/stop.js';

export const courierAvailabilityInputSchema = z.object({ online: z.boolean() });
export type CourierAvailabilityInput = z.infer<typeof courierAvailabilityInputSchema>;

export const courierLocationInputSchema = pointSchema.extend({
  /** GPS accuracy in metres, when the device reports it. */
  accuracy: z.number().min(0).max(10_000).optional(),
});
export type CourierLocationInput = z.infer<typeof courierLocationInputSchema>;

/** The courier moves the current stop one step forward. */
export const advanceStopInputSchema = z.discriminatedUnion('to', [
  z.object({ to: z.literal('EN_ROUTE') }),
  z.object({ to: z.literal('ARRIVED') }),
  z.object({
    to: z.literal('DONE'),
    deliveryCode: z
      .string()
      .regex(/^\d{4}$/, 'El código tiene 4 dígitos')
      .optional(),
  }),
  z.object({
    to: z.literal('FAILED'),
    failureReason: z.enum(STOP_FAILURE_REASONS),
    note: z.string().trim().max(300).optional(),
  }),
]);
export type AdvanceStopInput = z.infer<typeof advanceStopInputSchema>;
