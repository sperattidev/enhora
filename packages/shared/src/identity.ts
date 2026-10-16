import { z } from 'zod';
import { phoneSchema, pointSchema } from './job/schemas.js';

export const ROLES = ['ADMIN', 'MERCHANT', 'COURIER'] as const;
export type Role = (typeof ROLES)[number];

export const VEHICLES = ['MOTORCYCLE', 'BICYCLE', 'CAR', 'ON_FOOT'] as const;
export type Vehicle = (typeof VEHICLES)[number];

const CUIT_WEIGHTS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2] as const;

/** Validates an Argentine CUIT/CUIL (11 digits, dashes optional) including its check digit. */
export function isValidCuit(value: string): boolean {
  const digits = value.replace(/-/g, '');
  if (!/^\d{11}$/.test(digits)) return false;
  if (!['20', '23', '24', '25', '26', '27', '30', '33', '34'].includes(digits.slice(0, 2))) return false;
  const sum = CUIT_WEIGHTS.reduce((acc, w, i) => acc + w * Number(digits[i]), 0);
  const mod = 11 - (sum % 11);
  const check = mod === 11 ? 0 : mod === 10 ? 9 : mod;
  return check === Number(digits[10]);
}

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email('Email inválido').max(254));

export const passwordSchema = z
  .string()
  .min(10, 'La contraseña debe tener al menos 10 caracteres')
  .max(128, 'La contraseña es demasiado larga');

/** Stored without dashes: 20123456786. */
export const cuitSchema = z
  .string()
  .trim()
  .refine(isValidCuit, 'CUIT inválido')
  .transform((v) => v.replace(/-/g, ''));

/** Stored without dots: 30123456. */
export const dniSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/\./g, ''))
  .pipe(z.string().regex(/^\d{7,8}$/, 'DNI inválido'));

const citySlugSchema = z
  .string()
  .trim()
  .regex(/^[a-z0-9-]{2,60}$/);

const accountBase = z.object({
  email: emailSchema,
  password: passwordSchema,
  phone: phoneSchema,
  citySlug: citySlugSchema,
});

export const registerMerchantInputSchema = accountBase.extend({
  legalName: z.string().trim().min(2).max(120),
  displayName: z.string().trim().min(2).max(80),
  cuit: cuitSchema,
  address: z.string().trim().min(3).max(200),
  location: pointSchema,
});
export type RegisterMerchantInput = z.infer<typeof registerMerchantInputSchema>;

export const registerCourierInputSchema = accountBase.extend({
  fullName: z.string().trim().min(3).max(120),
  dni: dniSchema,
  vehicle: z.enum(VEHICLES),
});
export type RegisterCourierInput = z.infer<typeof registerCourierInputSchema>;

export const loginInputSchema = z.object({
  email: emailSchema,
  // No policy check on login: an old password must still be able to sign in.
  password: z.string().min(1).max(128),
});
export type LoginInput = z.infer<typeof loginInputSchema>;
