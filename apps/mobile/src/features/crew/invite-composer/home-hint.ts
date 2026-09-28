/**
 * The home airport hint for a picked contact: the country their number dials into (longest
 * calling-code match) and that country's busiest airport. Only the hint leaves the device, never
 * the number itself (the server keeps only its hash).
 */
import type { Airport } from '@cp/domain';

export function countryOfNumber(
  e164: string,
  dialCodes: Readonly<Record<string, string>>,
): string | null {
  const digits = e164.replace(/^\+/u, '');
  let best: { country: string; length: number } | null = null;
  for (const [country, code] of Object.entries(dialCodes)) {
    if (digits.startsWith(code) && (best === null || code.length > best.length)) {
      best = { country, length: code.length };
    }
  }
  return best?.country ?? null;
}

export function homeHintFor(
  e164: string,
  dialCodes: Readonly<Record<string, string>>,
  airports: readonly Airport[],
): string | null {
  const country = countryOfNumber(e164, dialCodes);
  if (country === null) return null;
  const inCountry = airports.filter((airport) => airport.country === country);
  inCountry.sort((a, b) => a.rank - b.rank || a.iata.localeCompare(b.iata));
  return inCountry[0]?.iata ?? null;
}

/** A typed number as E.164 (`+` and 7–15 digits), or null. */
export function toE164(typed: string): string | null {
  const digits = typed.replace(/[^\d+]/gu, '');
  const e164 = digits.startsWith('+') ? digits : `+${digits}`;
  return /^\+[1-9]\d{6,14}$/u.test(e164) ? e164 : null;
}
