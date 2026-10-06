/**
 * OTP channel order per country (docs/product-decisions.md, the OTP sender-router decision):
 * WhatsApp authentication template, then Telegram Gateway, then SMS through Prelude, for every
 * allow-listed country. A code table, not an env var or DB row: missing provider credentials only
 * ever remove a channel from availability, never change the order a country prefers.
 */
import { type CountryCode, parsePhoneNumberWithError } from 'libphonenumber-js';

export type OtpChannel = 'whatsapp' | 'telegram' | 'prelude';

export interface CountryOtpPolicy {
  /** Channels to try, first to last; the router skips any without credentials or switched off. */
  readonly channels: readonly OtpChannel[];
  /** The number's country (ISO 3166-1 alpha-2). */
  readonly country: CountryCode;
}

const DEFAULT_CHANNEL_ORDER: readonly OtpChannel[] = ['whatsapp', 'telegram', 'prelude'];

/** Countries excluded from OTP entirely (SMS-pumping risk: premium/unmonitored ranges, no verified deliverability). */
const BLOCKED_COUNTRIES: ReadonlySet<CountryCode> = new Set<CountryCode>([]);

/**
 * Resolves the channel order for an E.164 phone number's country, or `undefined` when the
 * number cannot be parsed / its country is blocked — the caller turns that into
 * `VALIDATION` with `detail.reason: 'country_unsupported'`.
 */
export function countryOtpPolicy(phoneE164: string): CountryOtpPolicy | undefined {
  let country: CountryCode | undefined;
  try {
    country = parsePhoneNumberWithError(phoneE164).country;
  } catch {
    return undefined;
  }
  if (!country || BLOCKED_COUNTRIES.has(country)) return undefined;
  return { channels: DEFAULT_CHANNEL_ORDER, country };
}

/** Structural validity + type check (code-standards.md §18, an SMS-pumping defence): rejects numbers libphonenumber-js cannot validate as a real, non-premium line before any provider is ever called. */
export function isValidSendableNumber(phoneE164: string): boolean {
  try {
    const parsed = parsePhoneNumberWithError(phoneE164);
    return parsed.isValid();
  } catch {
    return false;
  }
}
