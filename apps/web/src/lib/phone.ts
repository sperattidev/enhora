/**
 * Normalizes an Argentine mobile number as people write it ("3465 12-3456", "03465 15 123456",
 * "+54 9 3465 123456") into E.164 with the mobile 9: +5493465123456. Returns null when it is not
 * a 10-digit national number once prefixes are removed.
 */
export function normalizeArPhone(input: string): string | null {
  let digits = input.replace(/\D/g, '');
  if (digits.startsWith('54')) digits = digits.slice(2);
  if (digits.startsWith('9') && digits.length === 11) digits = digits.slice(1);
  if (digits.startsWith('0')) digits = digits.slice(1);
  // Old style "area + 15 + number": drop the 15 right after a 2 to 4 digit area code.
  if (digits.length === 12) {
    for (const areaLength of [4, 3, 2]) {
      if (digits.slice(areaLength, areaLength + 2) === '15') {
        digits = digits.slice(0, areaLength) + digits.slice(areaLength + 2);
        break;
      }
    }
  }
  return /^\d{10}$/.test(digits) ? `+549${digits}` : null;
}

/** wa.me link that opens a WhatsApp chat with a prefilled message. */
export function whatsappLink(text: string, phone?: string | null): string {
  const to = phone ? phone.replace(/\D/g, '') : '';
  return `https://wa.me/${to}?text=${encodeURIComponent(text)}`;
}
