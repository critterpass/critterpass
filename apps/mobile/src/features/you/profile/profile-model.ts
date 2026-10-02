/**
 * The profile as the screen prints it (3n-1), built from synced rows: who the user is, the three
 * stats, the stamps row (newest first, the next trip's dashed stamp last), travel style, crews and
 * the passport footer. Pure, so a fresh account, a seasoned one and odd rows are all checked in
 * tests. Copy stays in the view: this holds names, dates and counts only.
 */
/* eslint-disable lingui/no-unlocalized-strings -- wire values and the machine-readable line, never copy. */
import {
  guideOfForm,
  homeBaseFor,
  isTasteTag,
  mrzName,
  mrzPassNumber,
  travelHistory,
  type AirportDataset,
  type OnboardingGuide,
  type TasteTag,
  type TravelHistory,
} from '@cp/domain';

import type {
  CrewMemberRow,
  CrewRow,
  CrewTripRow,
  HistoryTripRow,
  MeRow,
  PastTripRow,
  StampRow,
} from './profile-queries';
import { memberFirstName } from '@/ui/people/member-name';

/** Stamps on the profile row before "ALL n ›" takes over. */
export const STAMPS_SHOWN = 5;
/** Travel style tags shown, as designed; the quiz can give many more. */
export const TAGS_SHOWN = 5;
/** Faces on a crew row. */
export const CREW_FACES = 4;

export type ProfileAvatar =
  { readonly kind: 'initials' } | { readonly kind: 'guide'; readonly guide: OnboardingGuide };

export interface ProfileStamp {
  readonly id: string;
  readonly kind: 'home' | 'trip' | 'upcoming';
  /** The place's name, or the home airport's code. */
  readonly title: string;
  /** First day of the trip (`YYYY-MM-DD`), when known. */
  readonly date: string | null;
  /** Whole days until an upcoming trip starts; null when it has no date yet. */
  readonly daysUntil: number | null;
  /** The destination's own ink, when it has one. */
  readonly ink: string | null;
}

export type CrewLine =
  | { readonly kind: 'upcoming'; readonly place: string; readonly days: number }
  | { readonly kind: 'planning'; readonly place: string | null }
  | { readonly kind: 'past'; readonly place: string; readonly date: string }
  | { readonly kind: 'none' };

export interface ProfileCrew {
  readonly id: string;
  readonly name: string;
  readonly members: readonly {
    readonly id: string;
    readonly name: string;
    readonly joinIndex: number;
  }[];
  readonly line: CrewLine;
}

export interface ProfileModel {
  readonly name: string;
  readonly username: string | null;
  readonly homeCity: string | null;
  readonly avatar: ProfileAvatar;
  readonly passPlus: boolean;
  readonly stats: Pick<TravelHistory, 'trips' | 'countries' | 'critters'>;
  readonly stamps: readonly ProfileStamp[];
  readonly stampTotal: number;
  readonly tags: readonly TasteTag[];
  readonly crews: readonly ProfileCrew[];
  /** `P<SGPWINSTON<<CP0427` */
  readonly mrz: string;
  readonly sinceYear: number;
}

export interface ProfileInput {
  readonly me: MeRow | null;
  readonly stamps: readonly StampRow[];
  readonly trips: readonly HistoryTripRow[];
  readonly pastTrips: readonly PastTripRow[];
  readonly critters: number;
  readonly crews: readonly CrewRow[];
  readonly crewMembers: readonly CrewMemberRow[];
  readonly crewTrips: readonly CrewTripRow[];
  readonly airports: AirportDataset;
  /** Today in the device's zone, `YYYY-MM-DD`. */
  readonly today: string;
}

const DAY_MS = 86_400_000;

function day(value: string): number {
  return Date.parse(`${value.slice(0, 10)}T00:00:00Z`);
}

/** Whole days from `today` to `date`; negative once it has passed. */
export function daysBetween(today: string, date: string): number {
  return Math.round((day(date) - day(today)) / DAY_MS);
}

function parseTags(raw: string | null): TasteTag[] {
  if (raw === null) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((tag): tag is TasteTag => typeof tag === 'string' && isTasteTag(tag))
      : [];
  } catch {
    return [];
  }
}

/** The first day of a `[2024-06-01,2024-06-09)` range. */
function rangeStart(range: string | null): string | null {
  return range === null ? null : (/\d{4}-\d{2}-\d{2}/.exec(range)?.[0] ?? null);
}

function stampOf(row: StampRow, today: string): ProfileStamp | null {
  if (row.kind === 'home') {
    if (row.iata === null) return null;
    return { id: row.id, kind: 'home', title: row.iata, date: null, daysUntil: null, ink: null };
  }
  const title = row.destination_name;
  if (title === null) return null;
  const date = rangeStart(row.dates) ?? row.trip_start ?? row.stamped_at?.slice(0, 10) ?? null;
  const ink = row.ink_colour ?? row.destination_colour;
  if (row.status === 'upcoming') {
    const daysUntil = date === null ? null : Math.max(0, daysBetween(today, date));
    return { id: row.id, kind: 'upcoming', title, date, daysUntil, ink };
  }
  return { id: row.id, kind: 'trip', title, date, daysUntil: null, ink };
}

/** Newest first, the home stamp after the trips, and what is still to come last (soonest first). */
function orderStamps(stamps: readonly ProfileStamp[]): ProfileStamp[] {
  const byDateDesc = (a: ProfileStamp, b: ProfileStamp) =>
    (b.date ?? '').localeCompare(a.date ?? '');
  const trips = stamps.filter((stamp) => stamp.kind === 'trip').sort(byDateDesc);
  const home = stamps.filter((stamp) => stamp.kind === 'home');
  const upcoming = stamps
    .filter((stamp) => stamp.kind === 'upcoming')
    .sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999'));
  return [...trips, ...home, ...upcoming];
}

/** At most `STAMPS_SHOWN`, always keeping the next trip's dashed stamp in view. */
function visibleStamps(ordered: readonly ProfileStamp[]): ProfileStamp[] {
  if (ordered.length <= STAMPS_SHOWN) return [...ordered];
  const next = ordered.find((stamp) => stamp.kind === 'upcoming');
  const rest = ordered.filter((stamp) => stamp !== next);
  return next === undefined
    ? rest.slice(0, STAMPS_SHOWN)
    : [...rest.slice(0, STAMPS_SHOWN - 1), next];
}

function crewLine(trips: readonly CrewTripRow[], today: string): CrewLine {
  const dated = trips.filter((trip) => trip.start_date !== null && trip.destination_name !== null);
  const upcoming = dated
    .filter((trip) => daysBetween(today, trip.start_date ?? today) >= 0)
    .sort((a, b) => (a.start_date ?? '').localeCompare(b.start_date ?? ''))[0];
  if (upcoming !== undefined) {
    return {
      kind: 'upcoming',
      place: upcoming.destination_name ?? '',
      days: daysBetween(today, upcoming.start_date ?? today),
    };
  }
  const undated = trips.find((trip) => trip.start_date === null);
  if (undated !== undefined) return { kind: 'planning', place: undated.destination_name };
  const last = dated.sort((a, b) => (b.start_date ?? '').localeCompare(a.start_date ?? ''))[0];
  if (last !== undefined) {
    return { kind: 'past', place: last.destination_name ?? '', date: last.start_date ?? today };
  }
  return { kind: 'none' };
}

export function buildProfile(input: ProfileInput): ProfileModel {
  const { me, today } = input;
  const name = me?.display_name?.trim() ?? '';
  const home = me?.home_airport == null ? null : homeBaseFor(input.airports, me.home_airport);
  const guide =
    me?.avatar_kind === 'critter' && me.avatar_form_id !== null
      ? guideOfForm(me.avatar_form_id)
      : null;
  const history = travelHistory({
    trips: input.trips.map((trip) => ({
      id: trip.id,
      country: trip.country,
      startDate: trip.start_date,
    })),
    pastTrips: input.pastTrips.map((past) => ({
      id: past.id,
      country: past.country,
      month: past.month,
      placeId: past.place_id,
    })),
    homeCountry: me?.home_country ?? home?.country ?? null,
    critters: input.critters,
    memberSince: me?.member_since ?? today,
  });
  const ordered = orderStamps(
    input.stamps.flatMap((row) => {
      const stamp = stampOf(row, today);
      return stamp === null ? [] : [stamp];
    }),
  );
  const crews = input.crews.map((crew): ProfileCrew => {
    const members = input.crewMembers
      .filter((member) => member.crew_id === crew.id)
      .map((member, joinIndex) => ({
        id: member.user_id,
        name: memberFirstName(member.display_name),
        joinIndex,
      }));
    return {
      id: crew.id,
      name: crew.name?.trim() ?? '',
      members,
      line: crewLine(
        input.crewTrips.filter((trip) => trip.crew_id === crew.id),
        today,
      ),
    };
  });
  return {
    name,
    username: me?.username ?? null,
    homeCity: home?.city ?? null,
    avatar: guide === null ? { kind: 'initials' } : { kind: 'guide', guide },
    passPlus: me?.pass_plus === 1,
    stats: { trips: history.trips, countries: history.countries, critters: history.critters },
    stamps: visibleStamps(ordered),
    stampTotal: ordered.length,
    tags: parseTags(me?.taste_tags ?? null).slice(0, TAGS_SHOWN),
    crews,
    mrz: `P<${home?.countryIso3 ?? 'CP'}${mrzName(name)}<<${mrzPassNumber(me?.pass_number ?? null)}`,
    sinceYear: history.sinceYear,
  };
}
