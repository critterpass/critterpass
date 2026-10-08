/**
 * Change review pushes: an affected member's yes is needed (category `cp.changeset`, so Approve and
 * Reject answer `approve_changeset` straight from the notification), and the result once the vote
 * applied, rejected or ran out. Only change sets put to a vote push; the guide's own applied
 * changes announce themselves through `guide_acted`.
 */
import { loadPollState } from '@cp/db';
import {
  changeReviewLink,
  CHANGESET_APPLIED_BODY,
  CHANGESET_APPLIED_TITLE,
  CHANGESET_KEPT_BODY,
  CHANGESET_KEPT_TITLE,
  CHANGESET_NEEDS_YES_BODY,
  CHANGESET_NEEDS_YES_TITLE,
  tripPlanLink,
} from '@cp/domain';
import type pg from 'pg';

import { registerNotification, type RoutedEvent } from '../notify/register';
import { setupFacts, str } from '../setup/facts';

interface VoteFacts {
  readonly tripId: string;
  readonly changeSetId: string;
  readonly authorId: string;
  readonly pollId: string;
  readonly voters: readonly string[];
  readonly pending: readonly string[];
  readonly count: number;
  readonly open: boolean;
}

async function voteFacts(tx: pg.PoolClient, event: RoutedEvent): Promise<VoteFacts | undefined> {
  const id = str(event, 'change_set_id');
  if (id === null) return undefined;
  const { rows } = await tx.query<{
    trip_id: string;
    author_id: string;
    poll_id: string | null;
    count: number;
  }>(
    `SELECT trip_id, author_id, poll_id,
            (SELECT count(*)::int FROM jsonb_array_elements(ops) AS op
              WHERE coalesce((op->>'accepted')::boolean, true)) AS count
       FROM change_sets WHERE id = $1`,
    [id],
  );
  const row = rows[0];
  if (row?.poll_id === null || row === undefined) return undefined;
  const state = await loadPollState(tx, row.poll_id);
  if (state === undefined) return undefined;
  const voted = new Set(state.ballots.map((ballot) => ballot.user_id));
  return {
    tripId: row.trip_id,
    changeSetId: id,
    authorId: row.author_id,
    pollId: row.poll_id,
    voters: state.poll.eligible_voter_ids,
    pending: state.poll.eligible_voter_ids.filter((uid) => !voted.has(uid)),
    count: row.count,
    open: state.poll.status === 'open',
  };
}

async function askerName(tx: pg.PoolClient, uid: string): Promise<string> {
  const { rows } = await tx.query<{ name: string | null }>(
    "SELECT split_part(trim(display_name), ' ', 1) AS name FROM users WHERE id = $1",
    [uid],
  );
  return rows[0]?.name ?? '';
}

export function registerPlanPushes(): void {
  registerNotification({
    key: 'changeset_needs_yes',
    event: 'change_set.proposed',
    async audience(tx, event) {
      const facts = await voteFacts(tx, event);
      return facts?.open === true ? facts.pending.filter((uid) => uid !== facts.authorId) : [];
    },
    async compose(tx, event, uid) {
      const facts = await voteFacts(tx, event);
      if (facts?.open !== true || !facts.pending.includes(uid)) return null;
      const trip = await setupFacts(tx, facts.tripId);
      if (trip === undefined) return null;
      return {
        title: CHANGESET_NEEDS_YES_TITLE,
        body: CHANGESET_NEEDS_YES_BODY,
        vars: { asker: await askerName(tx, facts.authorId), count: facts.count, crew: trip.crew },
        sender: trip.guide,
        crewId: trip.crewId,
        tripId: facts.tripId,
        deepLink: changeReviewLink(facts.tripId, facts.changeSetId),
        ctx: { change_set_id: facts.changeSetId, poll_id: facts.pollId, trip_id: facts.tripId },
        needsYou: true,
        collapseVars: { change_set_id: facts.changeSetId },
      };
    },
  });
  for (const type of ['change_set.applied', 'change_set.rejected', 'change_set.expired']) {
    registerNotification({
      key: 'changeset_decided',
      event: type,
      async audience(tx, event) {
        const facts = await voteFacts(tx, event);
        if (facts === undefined) return [];
        return [...new Set([...facts.voters, facts.authorId])].filter(
          (uid) => uid !== event.actorId,
        );
      },
      async compose(tx, event) {
        const facts = await voteFacts(tx, event);
        const trip = facts === undefined ? undefined : await setupFacts(tx, facts.tripId);
        if (facts === undefined || trip === undefined) return null;
        const applied = event.type === 'change_set.applied';
        return {
          title: applied ? CHANGESET_APPLIED_TITLE : CHANGESET_KEPT_TITLE,
          body: applied ? CHANGESET_APPLIED_BODY : CHANGESET_KEPT_BODY,
          vars: { crew: trip.crew },
          sender: trip.guide,
          crewId: trip.crewId,
          tripId: facts.tripId,
          deepLink: tripPlanLink(facts.tripId),
          ctx: { change_set_id: facts.changeSetId, trip_id: facts.tripId },
          collapseVars: { change_set_id: facts.changeSetId },
        };
      },
    });
  }
}
