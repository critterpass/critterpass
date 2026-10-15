/**
 * Where the hub's planning CTA and ticker lines lead. An open destination vote opens its pitch
 * board page while it is still on its board, and the showdown (3c-1) once it is down to two; a
 * closed one opens what it decided. Home draws the same vote, so it is the way when neither page
 * is registered.
 */
/* eslint-disable lingui/no-unlocalized-strings -- route paths and design ids, never copy. */
import { t } from '@lingui/core/macro';
import type { Href } from 'expo-router';

import { hrefFor } from '@/lib/navigation/screen-registry';

import type { ActivityRow, OpenVote } from './data/use-hub';

/** Home, where the crew's open destination vote is drawn. */
export const HOME: Href = '/';

/** Trip setup at the step the trip is on (the route picks it), not always its first. */
export function setupHref(tripId: string): Href {
  return { pathname: '/[tripId]/setup', params: { tripId } };
}

/** The crew's chat, where a called-off trip's messages stay to read. */
export function chatHref(crewId: string): Href {
  return { pathname: '/crew/[crewId]/chat', params: { crewId } };
}

/** This trip's bookings and money in the wallet tab, which otherwise picks a trip of its own. */
export function walletHref(tripId: string, page: 'bookings' | 'money'): Href {
  return page === 'bookings'
    ? { pathname: '/(tabs)/wallet/bookings', params: { tripId } }
    : { pathname: '/(tabs)/wallet/money', params: { tripId } };
}

const SETTING_UP: ReadonlySet<string> = new Set(['won', 'setup']);

export function voteHref(vote: OpenVote): Href | undefined {
  if (vote.stage === 'final') return hrefFor('3c-1', { pollId: vote.id });
  return hrefFor('vote-board', { pollId: vote.id }) ?? HOME;
}

export interface PlanningLink {
  readonly label: string;
  readonly href: Href | undefined;
  /** What the guide says beside the button: what is behind it, never the button's own words. */
  readonly note?: string;
}

/** The header's CTA while the trip is still being planned, by the trip's status. */
export function planningLink(
  tripId: string,
  status: string,
  vote: OpenVote | undefined,
): PlanningLink {
  // A trip still voting has no plan to see: until the poll's row is on the phone, the vote is on Home.
  if (status === 'voting') {
    return {
      note: t({ id: 'trip.hub.note.vote', message: 'The crew is still picking where to go.' }),
      label: t({ id: 'trip.hub.cta.vote', message: 'Voting' }),
      href: vote === undefined ? HOME : voteHref(vote),
    };
  }
  if (SETTING_UP.has(status)) {
    return {
      note: t({
        id: 'trip.hub.note.setup',
        message: 'A few answers from the crew and I can draft the days.',
      }),
      label: t({ id: 'trip.hub.cta.setup', message: 'Set up the trip' }),
      href: setupHref(tripId),
    };
  }
  return {
    note: t({
      id: 'trip.hub.note.plan',
      message: 'Every day’s stops, times and the map are in the plan.',
    }),
    label: t({ id: 'trip.hub.cta.plan', message: 'See the plan' }),
    href: hrefFor('plan-hub', { tripId }),
  };
}

/**
 * Where a ticker event leads: the vote, the change, or the plan it touched. A vote that is decided
 * leads to what it decided (set-up while the trip is there, the plan after): its reveal has played.
 */
export function activityHref(
  row: Pick<ActivityRow, 'object_kind' | 'object_id' | 'verb'>,
  tripId: string,
  status: string | null = null,
): Href | undefined {
  if (row.object_id === null) return undefined;
  switch (row.object_kind) {
    case 'poll':
      if (row.verb !== 'decided') return HOME;
      if (status === 'voting') return undefined;
      return status !== null && SETTING_UP.has(status)
        ? setupHref(tripId)
        : hrefFor('plan-hub', { tripId });
    case 'poll_option':
      return HOME;
    case 'change_set':
      return hrefFor('7h-7', { tripId, changesetId: row.object_id });
    case 'trip':
    case 'itinerary_version':
      return hrefFor('plan-hub', { tripId });
    default:
      return undefined;
  }
}
