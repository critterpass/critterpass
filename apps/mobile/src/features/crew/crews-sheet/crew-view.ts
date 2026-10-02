/**
 * The crews sheet's cards from the synced snapshot: each crew with its members in join order and
 * a one-line status from its next live trip, and in-app invites split into open and "Later"
 * (kept until they expire).
 */
/* eslint-disable lingui/no-unlocalized-strings -- row discriminants and dates, never copy. */
import type { CrewsSnapshot, InviteRow, TripHeader } from './crew-data';
import { memberFirstName } from '@/ui/people/member-name';

export interface CrewCardView {
  readonly id: string;
  readonly name: string;
  readonly members: readonly { readonly name: string; readonly colour: string | null }[];
  readonly nextTrip: TripHeader | null;
  readonly active: boolean;
}

export interface InviteCardView {
  readonly id: string;
  readonly crewId: string;
  readonly crewName: string;
  readonly inviterName: string;
  readonly later: boolean;
}

function firstName(name: string | null): string {
  return memberFirstName(name);
}

const DAY_MS = 86_400_000;

/** Whole days from `now` to a trip's start date (local calendar), or null without one. */
export function daysUntil(startDate: string | null, now: Date): number | null {
  if (startDate === null) return null;
  const start = Date.parse(`${startDate}T00:00:00`);
  if (Number.isNaN(start)) return null;
  return Math.ceil((start - now.getTime()) / DAY_MS);
}

/**
 * The trip a crew card talks about: the earliest dated trip with a destination (the one Home
 * counts down to), else any trip with a destination, else the first one (a trip still voting on
 * where to go).
 */
function nextTrip(trips: readonly TripHeader[]): TripHeader | null {
  const placed = trips.filter((trip) => trip.place !== null);
  const dated = placed
    .filter((trip) => trip.start_date !== null)
    .sort((a, b) => (a.start_date ?? '').localeCompare(b.start_date ?? ''));
  return dated[0] ?? placed[0] ?? trips[0] ?? null;
}

export function crewCards(snapshot: CrewsSnapshot): CrewCardView[] {
  const memberOf = new Set(snapshot.members.map((m) => m.crew_id));
  return snapshot.crews
    .filter((crew) => memberOf.has(crew.id))
    .map((crew) => ({
      id: crew.id,
      name: crew.name,
      members: snapshot.members
        .filter((m) => m.crew_id === crew.id)
        .map((m) => ({ name: firstName(m.display_name), colour: m.colour })),
      nextTrip: nextTrip(snapshot.trips.filter((trip) => trip.crew_id === crew.id)),
      active: snapshot.activeCrewId === crew.id,
    }));
}

export function inviteCards(snapshot: CrewsSnapshot, now: Date): InviteCardView[] {
  const names = new Map(snapshot.crews.map((crew) => [crew.id, crew.name]));
  const people = new Map(snapshot.members.map((m) => [m.user_id, firstName(m.display_name)]));
  return snapshot.invites
    .filter((invite: InviteRow) => Date.parse(invite.expires_at) > now.getTime())
    .map((invite) => ({
      id: invite.id,
      crewId: invite.crew_id,
      crewName: names.get(invite.crew_id) ?? '',
      inviterName: people.get(invite.inviter_id) ?? '',
      later: invite.status === 'later',
    }));
}
