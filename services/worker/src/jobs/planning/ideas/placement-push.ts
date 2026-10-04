/**
 * The quiet ping when Tokek has placed the ideas, to the person who asked only, opening their
 * private review (7h-7). The catalogue sends it only while their app is in the background: on the
 * placing screen the review simply replaces it. The text carries a count, never a place or a name.
 */
import { IDEAS_PLACED_BODY, IDEAS_PLACED_NONE_BODY, IDEAS_PLACED_TITLE } from '@cp/domain';

import { registerNotification } from '../../notify/register';
import { setupFacts, str } from '../../setup/facts';

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
      const { rows } = await tx.query<{ count: number }>(
        `SELECT jsonb_array_length(ops)::int AS count FROM change_sets
          WHERE id = $1 AND author_id = $2 AND status = 'draft'`,
        [changeSetId, uid],
      );
      const count = rows[0]?.count ?? 0;
      return {
        title: IDEAS_PLACED_TITLE,
        body: count === 0 ? IDEAS_PLACED_NONE_BODY : IDEAS_PLACED_BODY,
        vars: { guide: facts.guide.name, count },
        sender: facts.guide,
        crewId: facts.crewId,
        tripId,
        deepLink:
          changeSetId === null || count === 0
            ? `/trip/${tripId}/ideas`
            : `/trip/${tripId}/review/${changeSetId}`,
        ctx: { change_set_id: changeSetId, job_id: str(event, 'job_id') },
        collapseVars: { trip_id: tripId },
      };
    },
  });
}
