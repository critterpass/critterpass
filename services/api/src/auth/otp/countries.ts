/**
 * OTP provider-per-country routing (docs/product-decisions.md open question default: "WhatsApp
 * first everywhere allowed; SMS: Prelude for SEA, Twilio Verify elsewhere"). A code table, not an
 * env var or DB row: the phase's non-code-dependency table only ever removes a channel (missing
 * credentials skip it, phase-9 §Non-code dependencies), it never changes which provider a country
 * prefers.
 */
import { type CountryCode, parsePhoneNumberWithError } from 'libphonenumber-js';

export type OtpChannel = 'whatsapp' | 'twilio_verify' | 'prelude';

export interface CountryOtpPolicy {
  readonly whatsappAllowed: boolean;
  readonly smsChannel: Extract<OtpChannel, 'twilio_verify' | 'prelude'>;
}

const SEA_PRELUDE_COUNTRIES: readonly CountryCode[] = [
  'VN',
  'SG',
  'ID',
  'MY',
  'TH',
  'PH',
  'KH',
  'LA',
  'MM',
  'BN',
];

/** Countries excluded from OTP entirely (SMS-pumping risk: premium/unmonitored ranges, no verified deliverability). */
const BLOCKED_COUNTRIES: ReadonlySet<CountryCode> = new Set<CountryCode>([]);

/**
 * Resolves the channel preference for an E.164 phone number's country, or `undefined` when the
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
  return {
    whatsappAllowed: true,
    smsChannel: SEA_PRELUDE_COUNTRIES.includes(country) ? 'prelude' : 'twilio_verify',
  };
}

/** Structural validity + type check (code-standards.md §18, F-029 SMS-pumping defence): rejects numbers libphonenumber-js cannot validate as a real, non-premium line before any provider is ever called. */
export function isValidSendableNumber(phoneE164: string): boolean {
  try {
    const parsed = parsePhoneNumberWithError(phoneE164);
    return parsed.isValid();
  } catch {
    return false;
  }
}
