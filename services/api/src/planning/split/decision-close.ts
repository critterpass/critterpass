/**
 * When a split's decision vote closes, the winning way applies to the crew plan and the other
 * change sets on the poll are rejected; "leave it out" winning rejects them all. Runs in the same
 * transaction as the close (the last ballot needed, or an organiser closing it), as the system.
 */
import { onEventAppended, type AppendedDomainEvent } from '@cp/db';
import type pg from 'pg';

import { asSystemRole } from '../../admin/command';
import { advance, applyToGroup, lockChangeSet, rejectChangeSet } from '../../plan/changeset-store';
import type { PlanningModule } from '../register';

export async function settleSplitDecision(
  tx: pg.PoolClient,
  event: Pick<AppendedDomainEvent, 'id' | 'type'>,
): Promise<void> {
  if (event.type !== 'poll.closed') return;
  const { rows } = await asSystemRole(tx, () =>
    tx.query<{ id: string; winner: boolean }>(
      `SELECT cs.id, (o.id IS NOT NULL AND o.id = p.winner_option_id) AS winner
         FROM app.domain_event_for_routing($1) e
         JOIN polls p ON p.id = (e.payload->>'poll_id')::uuid AND p.kind = 'decision'
         JOIN change_sets cs ON cs.poll_id = p.id AND cs.trigger = 'split' AND cs.status = 'voting'
         LEFT JOIN poll_options o ON o.poll_id = p.id AND o.kind = 'changeset' AND o.ref_id = cs.id
        ORDER BY winner DESC, cs.id`,
      [event.id],
    ),
  );
  for (const found of rows) {
    const row = await lockChangeSet(tx, found.id);
    if (found.winner) {
      const approved = await advance(tx, row, ['approved'], { kind: 'vote', uid: null });
      await applyToGroup(tx, approved, { kind: 'system', id: null });
    } else {
      await rejectChangeSet(tx, row, null);
    }
  }
}

let hooked = false;

export const splitDecisionHooks: PlanningModule = () => {
  if (hooked) return;
  hooked = true;
  onEventAppended(settleSplitDecision);
};
