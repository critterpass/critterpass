/**
 * Taking back rows a disruption no longer needs: after the delay changed again (a new version), when
 * the flight is back on time, or on "undo everything". Newest first (packages/planner
 * `planUndo`): a done plan row is undone through `app.undo_guide_action` (same checks as a member's
 * UNDO: the window and an unchanged plan), a message the vendor already received gets a
 * compensation draft that again needs a yes, and anything still open is withdrawn (its poll
 * cancelled, its draft superseded).
 */
import { planUndo } from '@cp/planner';
import type { DisruptionAction } from '@cp/domain';
import type pg from 'pg';

import { cancelDecisionPoll } from './decision-poll';
import { withdrawVendorDraft } from './vendor-drafts';

export interface Retired {
  /** Rows with their new state, by id. */
  readonly moved: ReadonlyMap<string, DisruptionAction>;
  /** Compensation rows to start (draft + poll). */
  readonly compensations: readonly DisruptionAction[];
  readonly undone: number;
}

export function compensationRow(action: DisruptionAction, draft: string): DisruptionAction {
  const facts: Record<string, string | number> = { ...action.facts };
  // The message takes the vendor back: from the time we asked for to the original one.
  const original = action.facts['from'];
  const asked = action.facts['to'];
  if (original !== undefined) facts['to'] = original;
  if (asked !== undefined) facts['from'] = asked;
  delete facts['vendor_status'];
  return {
    ...action,
    id: `compensate:${action.id}`.slice(0, 120),
    state: 'draft_ready',
    autonomous: false,
    facts,
    decider: action.decider,
    poll: null,
    vendor_message_id: null,
    guide_action_id: null,
    decided_by: null,
    depends_on: null,
    label: draft,
  };
}

export async function retireRows(
  tx: pg.PoolClient,
  rows: readonly DisruptionAction[],
  actorId: string | null,
): Promise<Retired> {
  const moved = new Map<string, DisruptionAction>();
  const compensations: DisruptionAction[] = [];
  let undone = 0;
  for (const step of planUndo(rows)) {
    const action = step.action;
    if (step.step === 'undo_guide_action') {
      if (action.guide_action_id === null || actorId === null) continue;
      await tx.query('SAVEPOINT disruption_undo');
      try {
        await tx.query('SELECT app.undo_guide_action($1, $2)', [action.guide_action_id, actorId]);
        await tx.query('RELEASE SAVEPOINT disruption_undo');
        moved.set(action.id, { ...action, state: 'undone' });
        undone += 1;
      } catch {
        // The undo window closed or the plan moved on since: the row stays as it is.
        await tx.query('ROLLBACK TO SAVEPOINT disruption_undo');
      }
      continue;
    }
    if (step.step === 'compensate') {
      compensations.push(compensationRow(action, step.draft));
      continue;
    }
    if (action.poll !== null) await cancelDecisionPoll(tx, action.poll.id);
    if (action.vendor_message_id !== null) await withdrawVendorDraft(tx, action.vendor_message_id);
    moved.set(action.id, { ...action, state: 'withdrawn' });
  }
  return { moved, compensations, undone };
}
