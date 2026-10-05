/**
 * Where the hub's planning CTA and ticker lines lead. A destination vote lives on Home (the pitch
 * board, then the two-place final), so an open vote opens Home until it reaches its final, when
 * the showdown (3c-1) has its two places; a closed one opens the reveal (3c-2).
 */
/* eslint-disable lingui/no-unlocalized-strings -- route paths and design ids, never copy. */
import { t } from '@lingui/core/macro';
import type { Href } from 'expo-router';

import { hrefFor } from '@/lib/navigation/screen-registry';

import type { ActivityRow, OpenVote } from './data/use-hub';

/** Home, where the crew's open destination vote is drawn. */
export const HOME: Href = '/';

export function voteHref(vote: OpenVote): Href | undefined {
  return vote.stage === 'final' ? hrefFor('3c-1', { pollId: vote.id }) : HOME;
}

export interface PlanningLink {
  readonly label: string;
  readonly href: Href | undefined;
}

/** The header's CTA while the trip is still being planned, by the trip's status. */
export function planningLink(
  tripId: string,
  status: string,
  vote: OpenVote | undefined,
): PlanningLink {
  if (status === 'voting' && vote !== undefined) {
    return { label: t({ id: 'trip.hub.cta.vote', message: 'Voting' }), href: voteHref(vote) };
  }
  if (status === 'won' || status === 'setup') {
    return {
      label: t({ id: 'trip.hub.cta.setup', message: 'Set up the trip' }),
      href: hrefFor('3c-3', { tripId }),
    };
  }
  return {
    label: t({ id: 'trip.hub.cta.plan', message: 'See the plan' }),
    href: hrefFor('plan-hub', { tripId }),
  };
}

/** Where a ticker event leads: the vote, the change, or the plan it touched. */
export function activityHref(
  row: Pick<ActivityRow, 'object_kind' | 'object_id' | 'verb'>,
  tripId: string,
): Href | undefined {
  if (row.object_id === null) return undefined;
  switch (row.object_kind) {
    case 'poll':
      return row.verb === 'decided' ? hrefFor('3c-2', { pollId: row.object_id }) : HOME;
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
