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

import { daysBetween, orderStamps, visibleStamps, type ProfileStamp } from '../history/stamp-book';
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

/** Travel style tags shown, as designed; the quiz can give many more. */
export const TAGS_SHOWN = 5;
/** Faces on a crew row. */
export const CREW_FACES = 4;

export { daysBetween, STAMPS_SHOWN, type ProfileStamp } from '../history/stamp-book';

export type AvatarRing = 'rare' | 'epic' | 'legendary';

export type ProfileAvatar =
  { readonly kind: 'initials' } | { readonly kind: 'guide'; readonly guide: OnboardingGuide };

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
  /** The rarity ring of the critter worn as the avatar, when it has one. */
  readonly ring: AvatarRing | null;
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

function ringOf(raw: string | null): AvatarRing | null {
  return raw === 'rare' || raw === 'epic' || raw === 'legendary' ? raw : null;
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
  const ordered = orderStamps(input.stamps, input.pastTrips, today);
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
    ring: ringOf(me?.avatar_ring ?? null),
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
