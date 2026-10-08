/**
 * The quiet ping when Tokek has placed the ideas, to the person who asked only, opening their
 * private review (7h-7): a push, which the app shows as a banner when it is open (except on the
 * placing screen, where the review simply replaces it), and an inbox row that waits until the
 * review is sent, applied or overtaken. Both carry a count, never a place or a name.
 */
import {
  changeReviewLink,
  IDEAS_INBOX_KIND,
  IDEAS_PLACED_BODY,
  IDEAS_PLACED_NONE_BODY,
  IDEAS_PLACED_TITLE,
  ideasPlacedResolveKey,
  tripIdeasLink,
} from '@cp/domain';
import type pg from 'pg';

import { registerInboxFanout } from '../../inbox/fanout';
import { registerNotification } from '../../notify/register';
import { setupFacts, str } from '../../setup/facts';

/** How long an unopened review stays on top of the inbox. */
const REVIEW_WAITS_MS = 7 * 24 * 60 * 60 * 1000;

/** Stops still waiting in the requester's draft; 0 when nothing was placed or it has moved on. */
async function placedCount(
  tx: pg.PoolClient,
  changeSetId: string | null,
  uid: string,
): Promise<number> {
  const { rows } = await tx.query<{ count: number }>(
    `SELECT jsonb_array_length(ops)::int AS count FROM change_sets
      WHERE id = $1 AND author_id = $2 AND status = 'draft'`,
    [changeSetId, uid],
  );
  return rows[0]?.count ?? 0;
}

let registered = false;

export function registerPlacementPush(): void {
  if (registered) return;
  registered = true;
  registerNotification({
    key: 'ideas_placed',
    event: 'ideas.placed',
    audience: (_tx, event) => {
      const requester = str(event, 'user_id');
      return Promise.resolve(requester === null ? [] : [requester]);
    },
    async compose(tx, event, uid) {
      const tripId = str(event, 'trip_id');
      if (tripId === null || str(event, 'user_id') !== uid) return null;
      const facts = await setupFacts(tx, tripId);
      if (facts === undefined) return null;
      const changeSetId = str(event, 'change_set_id');
      const count = await placedCount(tx, changeSetId, uid);
      return {
        title: IDEAS_PLACED_TITLE,
        body: count === 0 ? IDEAS_PLACED_NONE_BODY : IDEAS_PLACED_BODY,
        vars: { guide: facts.guide.name, count },
        sender: facts.guide,
        crewId: facts.crewId,
        tripId,
        deepLink:
          changeSetId === null || count === 0
            ? tripIdeasLink(tripId)
            : changeReviewLink(tripId, changeSetId),
        ctx: { change_set_id: changeSetId, job_id: str(event, 'job_id') },
        collapseVars: { trip_id: tripId },
      };
    },
  });
  registerInboxFanout({
    kind: IDEAS_INBOX_KIND.placed,
    audience: (_tx, event) => {
      const requester = str(event, 'user_id');
      return Promise.resolve(requester === null ? [] : [requester]);
    },
    async build(tx, event, uid) {
      const tripId = str(event, 'trip_id');
      const changeSetId = str(event, 'change_set_id');
      if (tripId === null || changeSetId === null || str(event, 'user_id') !== uid) return null;
      const count = await placedCount(tx, changeSetId, uid);
      if (count === 0) return null;
      return {
        tripId,
        actorId: null,
        data: { change_set_id: changeSetId, job_id: str(event, 'job_id'), count },
        actions: [{ id: 'open', style: 'primary' }],
        deepLink: changeReviewLink(tripId, changeSetId),
        expiresAt: new Date(event.occurredAt.getTime() + REVIEW_WAITS_MS),
        resolveKey: ideasPlacedResolveKey(changeSetId),
      };
    },
  });
}
