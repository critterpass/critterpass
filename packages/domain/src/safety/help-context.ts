/**
 * `GET /v1/help/context` (docs/api-contracts.md §5.5): what the Help hub shows for where the
 * traveller is. Every number and facility comes from the curated catalogue (`emergency_numbers`,
 * `facilities`, each human-verified); nothing here is generated. A country without a curated row is
 * "limited coverage": the GSM emergency number (112, answered on mobile networks worldwide) and
 * any embassy on file.
 */
import { z } from 'zod';

/** Dialled from any mobile phone on a GSM network, routed to local emergency services. */
export const GSM_EMERGENCY_NUMBER = '112';

export const HELP_FACILITY_KINDS = ['hospital', 'clinic', 'pharmacy', 'embassy'] as const;
export type HelpFacilityKind = (typeof HELP_FACILITY_KINDS)[number];

export const EMERGENCY_SERVICE_KEYS = [
  'general',
  'police',
  'ambulance',
  'fire',
  'tourist_police',
  'coast_guard',
] as const;
export type EmergencyServiceKey = (typeof EMERGENCY_SERVICE_KEYS)[number];

export const emergencyLineSchema = z.object({
  service: z.enum(EMERGENCY_SERVICE_KEYS),
  number: z.string(),
  label: z.string(),
});
export type EmergencyLine = z.infer<typeof emergencyLineSchema>;

export const helpFacilitySchema = z.object({
  id: z.uuid(),
  kind: z.enum(HELP_FACILITY_KINDS),
  name: z.string(),
  address: z.string(),
  phone: z.string().nullable(),
  lat: z.number(),
  lng: z.number(),
  /** Minutes by car; `null` without a position. */
  minutes: z.number().int().min(0).nullable(),
  distance_m: z.number().int().min(0).nullable(),
  /** The minutes are a straight-line estimate. */
  estimate: z.boolean(),
  /** `true` open around the clock, `null` hours unknown. */
  open_now: z.boolean().nullable(),
  /** Only when the traveller's policy network is known to include it; never guessed. */
  insurance_match: z.boolean(),
  verified_at: z.iso.datetime({ offset: true }),
});
export type HelpFacility = z.infer<typeof helpFacilitySchema>;

export const helpPhraseSchema = z.object({
  key: z.string(),
  context: z.string(),
  language: z.string(),
  text: z.string(),
  romanisation: z.string().nullable(),
  gloss: z.string(),
  audio_key: z.string().nullable(),
});
export type HelpPhrase = z.infer<typeof helpPhraseSchema>;

export const helpContextSchema = z.object({
  trip_id: z.uuid(),
  country: z.string().nullable(),
  coverage: z.enum(['full', 'limited']),
  place_label: z.string().nullable(),
  numbers: z.object({
    general: z.string(),
    lines: z.array(emergencyLineSchema),
    verified_at: z.iso.datetime({ offset: true }).nullable(),
    source_url: z.string().nullable(),
  }),
  facilities: z.array(helpFacilitySchema),
  phrases: z.array(helpPhraseSchema),
  active_share: z
    .object({ share_id: z.uuid(), ends_at: z.iso.datetime({ offset: true }) })
    .nullable(),
});
export type HelpContext = z.infer<typeof helpContextSchema>;

/** The curated lines of a country, or the limited-coverage fallback when none are on file. */
export function emergencyNumbersFor(lines: readonly EmergencyLine[] | null): {
  readonly general: string;
  readonly lines: readonly EmergencyLine[];
} {
  if (lines === null || lines.length === 0) {
    return {
      general: GSM_EMERGENCY_NUMBER,
      lines: [{ service: 'general', number: GSM_EMERGENCY_NUMBER, label: '' }],
    };
  }
  const general =
    lines.find((line) => line.service === 'general') ??
    lines.find((line) => line.service === 'ambulance') ??
    lines[0];
  return { general: general?.number ?? GSM_EMERGENCY_NUMBER, lines };
}

/** Phrase keys the hub and each checklist lead with (`<language>:<context>:<slug>`). */
export const HELP_PHRASE_SLUGS = {
  hub: ['emergency:need-doctor', 'emergency:help'],
  hurt: ['emergency:need-doctor', 'emergency:i-am-hurt'],
  lost_stolen: ['emergency:call-police', 'help:can-you-help-me'],
  lost: ['help:i-am-lost', 'help:show-on-map'],
  missed_ride: ['help:how-to-get-to', 'help:is-it-far'],
} as const;

export function phraseKeysFor(
  language: string | null,
  slugs: readonly string[],
): readonly string[] {
  return language === null ? [] : slugs.map((slug) => `${language}:${slug}`);
}

/** Facilities nearest first by travel minutes (unknown last), then by name. */
export function rankFacilities<T extends { minutes: number | null; name: string }>(
  facilities: readonly T[],
): T[] {
  return [...facilities].sort((a, b) => {
    const am = a.minutes ?? Number.POSITIVE_INFINITY;
    const bm = b.minutes ?? Number.POSITIVE_INFINITY;
    return am === bm ? a.name.localeCompare(b.name) : am - bm;
  });
}
