/**
 * The Help hub's model from what the phone holds (synced catalogue rows: the country's curated
 * numbers, the destination's facilities, the phrase cards) and, when online, the server's answer
 * (the street the traveller is on, facilities by drive time). Every number and facility comes from
 * curated rows; with none for the country, Help is "limited coverage" with the GSM number.
 */
/* eslint-disable lingui/no-unlocalized-strings -- facility kinds and wire values, never copy. */
import {
  distanceM,
  emergencyNumbersFor,
  HELP_PHRASE_SLUGS,
  phraseKeysFor,
  phraseLanguageFor,
  toCountryCode,
  type EmergencyLine,
  type HelpContext,
  type HelpFacilityKind,
  type HelpPhrase,
} from '@cp/domain';

export interface FacilityRow {
  readonly id: string;
  readonly kind: HelpFacilityKind;
  readonly name: string;
  readonly phone: string | null;
  readonly lat: number;
  readonly lng: number;
  readonly open_24h: number | null;
}

export interface HelpLocalInput {
  /** The destination's country as stored: an English name or an ISO code. */
  readonly country: string | null;
  /** The country's curated lines (`emergency_numbers.numbers`), or null when none are synced. */
  readonly lines: readonly EmergencyLine[] | null;
  readonly facilities: readonly FacilityRow[];
  readonly phrases: readonly HelpPhrase[];
  readonly at: { readonly lat: number; readonly lng: number } | null;
}

export interface HubFacility {
  readonly id: string;
  readonly kind: HelpFacilityKind;
  readonly name: string;
  readonly phone: string | null;
  readonly lat: number;
  readonly lng: number;
  readonly open24h: boolean;
  /** Minutes by car from the server; null offline. */
  readonly minutes: number | null;
  /** Straight-line metres from the last known position; null without one. */
  readonly distanceM: number | null;
}

export interface HubLine {
  readonly number: string;
  /** The curated label, in English. */
  readonly label: string;
  readonly service: EmergencyLine['service'];
}

export interface HubModel {
  readonly coverage: 'full' | 'limited';
  readonly placeLabel: string | null;
  /** `service` says which kind of line it is, so the screen can name it in the reader's language. */
  readonly general: HubLine;
  /** Tourist police, else police: the side tile. */
  readonly side: HubLine | null;
  readonly lines: readonly EmergencyLine[];
  readonly facility: HubFacility | null;
  readonly phrase: HelpPhrase | null;
  /** Everything on file, for the checklists. */
  readonly facilities: readonly HubFacility[];
  readonly phrases: readonly HelpPhrase[];
  /** The country as an ISO code, when known. */
  readonly country: string | null;
}

const MEDICAL: readonly HelpFacilityKind[] = ['hospital', 'clinic'];

function sideLine(lines: readonly EmergencyLine[], general: string): EmergencyLine | null {
  const pick = (service: EmergencyLine['service']) =>
    lines.find((line) => line.service === service && line.number !== general);
  return pick('tourist_police') ?? pick('police') ?? null;
}

function localFacilities(input: HelpLocalInput): HubFacility[] {
  return input.facilities.map((row) => ({
    id: row.id,
    kind: row.kind,
    name: row.name,
    phone: row.phone,
    lat: row.lat,
    lng: row.lng,
    open24h: row.open_24h === 1,
    minutes: null,
    distanceM: input.at === null ? null : Math.round(distanceM(input.at, row)),
  }));
}

function serverFacilities(context: HelpContext): HubFacility[] {
  return context.facilities.map((f) => ({
    id: f.id,
    kind: f.kind,
    name: f.name,
    phone: f.phone,
    lat: f.lat,
    lng: f.lng,
    open24h: f.open_now === true,
    minutes: f.minutes,
    distanceM: f.distance_m,
  }));
}

/**
 * Nearest medical facility: by drive minutes when the server measured them, else by straight-line
 * distance from the last known position, else by name (one source at a time, so keys compare).
 */
export function nearestMedical(facilities: readonly HubFacility[]): HubFacility | null {
  const key = (f: HubFacility) => f.minutes ?? f.distanceM ?? Number.POSITIVE_INFINITY;
  const medical = facilities.filter((f) => MEDICAL.includes(f.kind));
  return [...medical].sort((a, b) => key(a) - key(b) || a.name.localeCompare(b.name))[0] ?? null;
}

/** The phrase the hub leads with: the first hub phrase the country's language has a card for. */
export function hubPhrase(
  country: string | null,
  phrases: readonly HelpPhrase[],
): HelpPhrase | null {
  const keys = phraseKeysFor(phraseLanguageFor(country), HELP_PHRASE_SLUGS.hub);
  for (const key of keys) {
    const found = phrases.find((phrase) => phrase.key === key);
    if (found !== undefined) return found;
  }
  return null;
}

export function buildHubModel(input: HelpLocalInput, context: HelpContext | null): HubModel {
  const curated = context !== null ? context.numbers.lines : input.lines;
  const coverage =
    context !== null
      ? context.coverage
      : input.lines === null || input.lines.length === 0
        ? 'limited'
        : 'full';
  const numbers = emergencyNumbersFor(coverage === 'limited' ? null : (curated ?? null));
  const generalLine = numbers.lines.find((line) => line.number === numbers.general);
  const side = coverage === 'limited' ? null : sideLine(numbers.lines, numbers.general);
  const facilities = context !== null ? serverFacilities(context) : localFacilities(input);
  const phrases = context !== null && context.phrases.length > 0 ? context.phrases : input.phrases;
  const country = context?.country ?? toCountryCode(input.country);
  return {
    coverage,
    placeLabel: context?.place_label ?? null,
    general: {
      number: numbers.general,
      label: generalLine?.label ?? '',
      service: generalLine?.service ?? 'general',
    },
    side: side === null ? null : { number: side.number, label: side.label, service: side.service },
    lines: numbers.lines,
    facility: nearestMedical(facilities),
    phrase: hubPhrase(country, phrases),
    facilities,
    phrases,
    country,
  };
}
