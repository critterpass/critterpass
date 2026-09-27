/**
 * Shared keys and value checks for every content kind. Items are keyed by stable content ids
 * (`cp-112`, `cp-112:epic`), never by position or database uuid: a release can be rebuilt,
 * diffed against the previous one and re-published without the keys moving.
 */
import { z } from 'zod';

export const RARITIES = ['common', 'rare', 'epic', 'legendary'] as const;
export const raritySchema = z.enum(RARITIES);
export type Rarity = z.infer<typeof raritySchema>;

/** CritterDex id pinned in the design data: `cp-001` … `cp-150`. */
export const critterIdSchema = z.string().regex(/^cp-\d{3}$/u, 'must look like cp-001');

/** A form is one critter in one rarity: `cp-112:epic`. */
export const formKeySchema = z
  .string()
  .regex(/^cp-\d{3}:(common|rare|epic|legendary)$/u, 'must look like cp-112:epic');

export function formKey(critterId: string, rarity: Rarity): string {
  return `${critterId}:${rarity}`;
}

export function parseFormKey(key: string): { critterId: string; rarity: Rarity } {
  const [critterId, rarity] = key.split(':');
  return { critterId: critterId ?? '', rarity: raritySchema.parse(rarity) };
}

/** Design place code (one critter set per place): `vn`, `fr`, `hk`. */
export const placeCodeSchema = z.string().regex(/^[a-z]{2}$/u, 'must be a two-letter place code');

/** Lowercase slug used as a stable content key (`bali`, `water-temple`, `how-refunds-work`). */
export const slugSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/u, 'must be a lowercase-hyphen slug');

/** ISO 3166-1 alpha-2, upper case. */
export const countryCodeSchema = z.string().regex(/^[A-Z]{2}$/u, 'must be ISO 3166-1 alpha-2');

const KNOWN_CURRENCIES = new Set(Intl.supportedValuesOf('currency'));
export const currencyCodeSchema = z
  .string()
  .refine((code) => KNOWN_CURRENCIES.has(code), 'must be an ISO 4217 currency code');

const KNOWN_ZONES = new Set(Intl.supportedValuesOf('timeZone'));
/** IANA zone the runtime can resolve (`Etc/UTC` and friends are not used for places). */
export const timeZoneSchema = z
  .string()
  .refine((zone) => KNOWN_ZONES.has(zone) || isResolvableZone(zone), 'must be an IANA time zone');

function isResolvableZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone });
    return zone.includes('/');
  } catch {
    return false;
  }
}

/** BCP 47 primary language subtag (plus optional script/region): `vi`, `ja`, `zh-Hant`, `pt-PT`. */
export const languageTagSchema = z
  .string()
  .regex(/^[a-z]{2,3}(?:-[A-Z][a-z]{3})?(?:-[A-Z]{2})?$/u, 'must be a BCP 47 language tag');

export const httpsUrlSchema = z.url({ protocol: /^https$/u });

/** `YYYY-MM-DD`. */
export const isoDateSchema = z.iso.date();
