import { describe, expect, it } from 'vitest';
import {
  dniSchema,
  emailSchema,
  isValidCuit,
  loginInputSchema,
  registerCourierInputSchema,
  registerMerchantInputSchema,
} from './identity.js';

describe('isValidCuit', () => {
  it('accepts valid CUITs with and without dashes', () => {
    expect(isValidCuit('20-12345678-6')).toBe(true);
    expect(isValidCuit('30712345671')).toBe(true);
    expect(isValidCuit('27-23456789-1')).toBe(true);
  });

  it('rejects a wrong check digit', () => {
    expect(isValidCuit('20-12345678-5')).toBe(false);
  });

  it('rejects unknown prefixes and wrong lengths', () => {
    expect(isValidCuit('99-12345678-6')).toBe(false);
    expect(isValidCuit('20-1234567-6')).toBe(false);
  });
});

describe('identity schemas', () => {
  const merchant = {
    email: ' Pedidos@Rotiseria.com ',
    password: 'una-clave-larga',
    phone: '+5493465123456',
    citySlug: 'firmat',
    legalName: 'Rotisería La Esquina SRL',
    displayName: 'La Esquina',
    cuit: '20-12345678-6',
    address: 'Belgrano 1200',
    location: { lat: -33.4594, lng: -61.4832 },
  };

  it('normalizes merchant registration data', () => {
    const parsed = registerMerchantInputSchema.parse(merchant);
    expect(parsed.email).toBe('pedidos@rotiseria.com');
    expect(parsed.cuit).toBe('20123456786');
  });

  it('rejects short passwords', () => {
    expect(registerMerchantInputSchema.safeParse({ ...merchant, password: 'corta' }).success).toBe(false);
  });

  it('normalizes the DNI', () => {
    expect(dniSchema.parse('30.123.456')).toBe('30123456');
    expect(dniSchema.safeParse('123').success).toBe(false);
  });

  it('accepts a courier registration', () => {
    const { legalName: _l, displayName: _d, cuit: _c, address: _a, location: _p, ...account } = merchant;
    const parsed = registerCourierInputSchema.parse({
      ...account,
      fullName: 'Juan Pérez',
      dni: '30.123.456',
      vehicle: 'MOTORCYCLE',
    });
    expect(parsed.dni).toBe('30123456');
  });

  it('does not apply the password policy on login', () => {
    expect(loginInputSchema.safeParse({ email: 'a@b.com', password: 'x' }).success).toBe(true);
  });

  it('rejects malformed emails', () => {
    expect(emailSchema.safeParse('no-es-un-email').success).toBe(false);
  });
});
