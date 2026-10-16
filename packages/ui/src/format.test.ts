import { describe, expect, it } from 'vitest';
import { formatMoney, parsePesos } from './format';
import { normalizeArPhone, whatsappLink } from './phone';

describe('money', () => {
  it('formats cents as whole pesos', () => {
    expect(formatMoney(125_000).replace(/\s/g, ' ')).toBe('$ 1.250');
  });

  it('parses what people type', () => {
    expect(parsePesos('1.250')).toBe(125_000);
    expect(parsePesos('$ 1.250,50')).toBe(125_050);
    expect(parsePesos('800')).toBe(80_000);
    expect(parsePesos('')).toBeNull();
    expect(parsePesos('abc')).toBeNull();
    expect(parsePesos('-5')).toBeNull();
  });
});

describe('normalizeArPhone', () => {
  it.each([
    ['3465 12-3456', '+5493465123456'],
    ['03465 15 123456', '+5493465123456'],
    ['+54 9 3465 123456', '+5493465123456'],
    ['5493465123456', '+5493465123456'],
    ['011 15 2345 6789', '+5491123456789'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeArPhone(input)).toBe(expected);
  });

  it('rejects incomplete numbers', () => {
    expect(normalizeArPhone('123456')).toBeNull();
  });
});

describe('whatsappLink', () => {
  it('encodes the message and strips the phone to digits', () => {
    expect(whatsappLink('Hola & chau', '+5493465123456')).toBe('https://wa.me/5493465123456?text=Hola%20%26%20chau');
  });
});
