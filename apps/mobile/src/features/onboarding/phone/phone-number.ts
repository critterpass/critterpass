/**
 * Phone number entry for 3a-8: the country's calling code (defaulting from the home airport's
 * country, then the device region) and a loose E.164 check. The server's OTP route is the real
 * validator; this only stops obvious typos before a code is sent.
 */
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
  const digits = nationalDigits(input);
  const groups = digits.match(/.{1,4}/gu) ?? [];
  return `+${DIAL_CODES[country] ?? ''} ${groups.join(' ')}`.trim();
}

/** Resend waits 30 s, then 60 s, then 120 s. */
export function resendWaitS(sends: number): number {
  return sends <= 1 ? 30 : sends === 2 ? 60 : 120;
}

/**
 * Every dialable country with its localised name. Hermes has no `Intl.DisplayNames` (or answers
 * with the bare code), so `fallbackName` supplies a name the app ships; the code is the last resort.
 */
export function countryList(
  locale: string,
  fallbackName: (code: string) => string | undefined = () => undefined,
): readonly { code: string; name: string; dial: string }[] {
  let names: Intl.DisplayNames | null = null;
  try {
    names = new Intl.DisplayNames([locale], { type: 'region' });
  } catch {
    names = null;
  }
  const nameOf = (code: string) => {
    const native = names?.of(code);
    return native !== undefined && native !== code ? native : (fallbackName(code) ?? code);
  };
  return Object.entries(DIAL_CODES)
    .map(([code, dial]) => ({ code, dial, name: nameOf(code) }))
    .sort((a, b) => a.name.localeCompare(b.name, locale));
}
