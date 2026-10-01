/**
 * Phone number entry for 3a-8: the country's calling code (defaulting from the home airport's
 * country, then the device region) and a loose E.164 check. The server's OTP route is the real
 * validator; this only stops obvious typos before a code is sent.
 */
import { AsYouType, type CountryCode } from 'libphonenumber-js/min';

import { DIAL_CODES } from '@cp/content/onboarding';

export function dialCodeFor(country: string | null): string | null {
  if (country === null) return null;
  return DIAL_CODES[country] ?? null;
}

export function defaultCountry(homeCountry: string | null, deviceRegion: string | null): string {
  if (homeCountry !== null && DIAL_CODES[homeCountry] !== undefined) return homeCountry;
  if (deviceRegion !== null && DIAL_CODES[deviceRegion] !== undefined) return deviceRegion;
  return 'US';
}

/** Digits only, trunk zero dropped ("09123" → "9123"). */
export function nationalDigits(input: string): string {
  return input.replace(/\D/gu, '').replace(/^0+/u, '');
}

export function toE164(country: string, input: string): string | null {
  const code = DIAL_CODES[country];
  const digits = nationalDigits(input);
  if (code === undefined) return null;
  const total = code.length + digits.length;
  if (digits.length < 4 || total < 8 || total > 15) return null;
  return `+${code}${digits}`;
}

/** "+65 9123 4567": the number as the code-sent line prints it. */
export function formatE164(country: string, input: string): string {
  return `+${DIAL_CODES[country] ?? ''} ${formatNational(country, nationalDigits(input))}`.trim();
}

/** The national number grouped the way the country writes it ("9123 4567" for Singapore). */
export function formatNational(country: string, input: string): string {
  const digits = input.replace(/\D/gu, '');
  if (digits.length === 0) return '';
  return new AsYouType(country as CountryCode).input(digits);
}

/**
 * The field's next value after an edit, formatted as the user types: a pasted or typed
 * international number ("+84 949 840 370") switches the country and keeps its national part;
 * deleting only a space takes the digit before it with it (otherwise the space comes straight
 * back and the delete key seems to do nothing).
 */
export function typedNumber(
  country: string,
  previous: string,
  next: string,
): { readonly country: string; readonly number: string } {
  if (next.trimStart().startsWith('+')) {
    const typed = new AsYouType();
    typed.input(next);
    const found = typed.getCountry();
    const national = typed.getNumber()?.nationalNumber;
    if (found !== undefined && national !== undefined && DIAL_CODES[found] !== undefined) {
      return { country: found, number: formatNational(found, national) };
    }
  }
  let digits = next.replace(/\D/gu, '');
  if (next.length < previous.length && digits === previous.replace(/\D/gu, '')) {
    let at = 0;
    while (at < next.length && next[at] === previous[at]) at += 1;
    const before = previous.slice(0, at).replace(/\D/gu, '').length;
    digits = before === 0 ? digits : digits.slice(0, before - 1) + digits.slice(before);
  }
  return { country, number: formatNational(country, digits) };
}

/** Resend waits 30 s, then 60 s, then 120 s. */
export function resendWaitS(sends: number): number {
  return sends <= 1 ? 30 : sends === 2 ? 60 : 120;
}

/**
 * Every dialable country with its name in `locale`, sorted by it. `shippedName` is the name the app
 * carries for the code (features/onboarding/region-names); the platform's own `Intl.DisplayNames`
 * is only asked for a code the app has no name for (Hermes has none on iPhone, and elsewhere can
 * answer with the bare code), and the code itself is the last resort.
 */
export function countryList(
  locale: string,
  shippedName: (code: string) => string | undefined = () => undefined,
): readonly { code: string; name: string; dial: string }[] {
  let names: Intl.DisplayNames | null = null;
  try {
    names = new Intl.DisplayNames([locale], { type: 'region' });
  } catch {
    names = null;
  }
  const nameOf = (code: string) => {
    const shipped = shippedName(code);
    if (shipped !== undefined) return shipped;
    const native = names?.of(code);
    return native !== undefined && native !== code ? native : code;
  };
  return Object.entries(DIAL_CODES)
    .map(([code, dial]) => ({ code, dial, name: nameOf(code) }))
    .sort((a, b) => a.name.localeCompare(b.name, locale));
}
