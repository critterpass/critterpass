/**
 * `decide_disruption_action {disruption_id, action_id, decision}` (docs/api-contracts-trip.md
 * §4.12; the `cp.disruption` APPROVE action): an affected member answers a row that needs a yes.
 * The answer is their ballot on the row's decision poll, through `cast_ballot` itself, so the crew
 * decider (any affected when time-critical in the trip, else the affected majority with the
 * organiser breaking ties) closes it exactly as any vote; the worker then applies the approved row
 * or keeps the plan (`disruption.react`). A member the row does not affect cannot decide it.
 */
import { decideDisruptionActionPayloadSchema, DomainError, type PollTallyResult } from '@cp/domain';

import { castBallotCommand } from '../polls/cast-ballot';
import { defineCommand } from '../_framework/define-command';
import { requireDisruption, requireRow } from './shared';

const OPEN = new Set(['needs_yes', 'draft_ready']);

export const decideDisruptionActionCommand = defineCommand({
  name: 'decide_disruption_action',
  v: 1,
  schema: decideDisruptionActionPayloadSchema,
  offline: true,
  allowAnonymous: true,
  actionScope: 'ballot',
  authorize: async (tx, payload, ctx) => {
    const view = await requireDisruption(tx, payload.disruption_id, ctx.uid);
    const row = requireRow(view, payload.action_id);
    if (!row.affected_user_ids.includes(ctx.uid)) {
      throw new DomainError('NOT_ELIGIBLE', { reason: 'not_affected' });
    }
    if (row.poll === null || !OPEN.has(row.state)) {
      throw new DomainError('STATE_INVALID', { reason: 'not_waiting', state: row.state });
    }
  },
  handle: async (tx, payload, ctx): Promise<PollTallyResult & { readonly state: string }> => {
    const view = await requireDisruption(tx, payload.disruption_id, ctx.uid);
    const row = requireRow(view, payload.action_id);
    if (row.poll === null) throw new DomainError('STATE_INVALID', { reason: 'not_waiting' });
    const ballot = {
      poll_id: row.poll.id,
      option_id:
        payload.decision === 'approve' ? row.poll.approve_option_id : row.poll.keep_option_id,
    };
    await castBallotCommand.authorize(tx, ballot, ctx);
    const tally = await castBallotCommand.handle(tx, ballot, ctx);
    return { ...tally, state: row.state };
  },
});
