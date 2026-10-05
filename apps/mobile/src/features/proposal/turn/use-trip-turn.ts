/**
 * Whose turn it is on one trip, from synced rows: the trip's status, the viewer's role and answer,
 * the crew and the live proposal. Holds the trip's streams, so Home (which sits outside the trip
 * routes) has the participant and proposal rows the answer depends on. `null` while loading or
 * when the trip is not on the phone.
 */
import type { Href } from 'expo-router';

import { useTripStreams } from '@/data/powersync/use-trip-streams';
import { hrefFor } from '@/lib/navigation/screen-registry';

import { firstName } from '../data/format';
import { useCurrentProposal, type Proposal } from '../data/proposal';
import { useLiveRows } from '../data/rows';
import { useProposalTrip } from '../data/trip';
import { proposalRoutes } from '../routes';
import { turnCopy } from './copy';
import { tripTurn, type TripTurn, type TurnTarget } from './model';

export interface TripTurnView extends TripTurn {
  /** The organiser's first name ('' when the viewer organises, or it is not here). */
  readonly organiser: string;
  readonly isOrganiser: boolean;
  /** Active crew members, the viewer included. */
  readonly crewSize: number;
  /** Where the step's button leads; undefined when there is nothing to open. */
  readonly href: Href | undefined;
}

/* eslint-disable lingui/no-unlocalized-strings -- SQL and design screen ids, never copy. */
/** The oldest plan change open for a vote the viewer may cast and has not. */
const PLAN_VOTE_SQL = `SELECT cs.id, u.display_name AS author_name
  FROM change_sets cs
  JOIN polls p ON p.id = cs.poll_id
  LEFT JOIN users u ON u.id = cs.author_id
  WHERE cs.trip_id = ?1 AND p.status = 'open' AND cs.author_id <> ?2
    AND p.eligible_voter_ids LIKE '%' || ?2 || '%'
    AND NOT EXISTS (SELECT 1 FROM ballots b WHERE b.poll_id = p.id AND b.user_id = ?2)
  ORDER BY cs.created_at LIMIT 1`;
const PLAN_VOTE_TABLES = ['change_sets', 'polls', 'ballots', 'users'];

export function turnHref(
  target: TurnTarget | null,
  tripId: string,
  proposal: Pick<Proposal, 'id' | 'format'> | null,
  answered: boolean,
  changeSetId: string | null = null,
): Href | undefined {
  switch (target) {
    case 'review':
      return changeSetId === null
        ? undefined
        : hrefFor('3e-3', { tripId, changesetId: changeSetId });
    case 'setup':
      return hrefFor('3c-3', { tripId });
    case 'drafting':
      return hrefFor('3c-8', { tripId });
    case 'draft':
      return hrefFor('3c-9', { tripId });
    case 'builder':
      return proposalRoutes.build(tripId);
    case 'tracker':
      return proposal === null ? undefined : proposalRoutes.tracker(proposal.id);
    case 'proposal':
      if (proposal === null) return undefined;
      // The story plays once, before the answer; afterwards the version is where the answer lives.
      return proposal.format === 'trailer' && !answered
        ? proposalRoutes.trailer(proposal.id)
        : proposalRoutes.open(proposal.id);
    case null:
      return undefined;
  }
}
/* eslint-enable lingui/no-unlocalized-strings */

export function useTripTurn(tripId: string | null): TripTurnView | null {
  useTripStreams(tripId);
  const trip = useProposalTrip(tripId);
  const proposal = useCurrentProposal(tripId);
  const votes = useLiveRows<{ id: string; author_name: string | null }>(
    PLAN_VOTE_SQL,
    tripId === null || trip == null ? null : [tripId, trip.me],
    PLAN_VOTE_TABLES,
  );
  if (tripId === null || trip == null || proposal === undefined) return null;
  const vote = votes.rows[0] ?? null;
  const me = trip.people.find((person) => person.uid === trip.me);
  const step = tripTurn({
    status: trip.status,
    role: trip.isOrganiser ? 'organiser' : 'member',
    crewSize: trip.people.length,
    proposal: proposal === null ? null : { status: proposal.status, replyBy: proposal.replyBy },
    myRsvp: me?.rsvp ?? null,
    // Everyone else in the crew, those who said out included: their answer counts as one.
    recipients: trip.people.filter((person) => person.uid !== trip.me),
    planVote: vote === null ? null : { by: firstName(vote.author_name) },
  });
  const organiser = trip.isOrganiser ? '' : (trip.people.find((p) => p.organiser)?.name ?? '');
  return {
    ...step,
    organiser,
    isOrganiser: trip.isOrganiser,
    crewSize: trip.people.length,
    href: turnHref(step.target, tripId, proposal, step.turn.kind === 'answered', vote?.id ?? null),
  };
}

/** The turn as Home's slot wants it: the words, the button and where it leads. */
export function useTripTurnForHome(
  tripId: string | null,
  names: { readonly locale: string; readonly guide: string },
): {
  kind: string;
  mine: boolean;
  line: string;
  button: string | null;
  href: Href | undefined;
  organiser: string;
  crewSize: number;
} | null {
  const view = useTripTurn(tripId);
  if (view === null) return null;
  const copy = turnCopy(view.turn, { ...names, organiser: view.organiser });
  return {
    kind: view.turn.kind,
    mine: view.mine,
    line: copy.line,
    button: copy.button,
    href: view.href,
    organiser: view.organiser,
    crewSize: view.crewSize,
  };
}
