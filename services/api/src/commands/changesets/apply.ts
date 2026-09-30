/**
 * `apply_changeset` (docs/api-contracts.md §4.6). `group`: an organiser applies a change set to
 * the crew's plan, whether its vote has passed or not (an open vote closes as approved), and
 * confirms one whose booking impact waited for them. A stale set never applies; an applied one
 * answers as it stands. `personal`: any member applies the accepted changes to their own plan only
 * (../../plan/personal-apply.ts).
 */
import { applyChangesetPayloadSchema, DomainError, type ChangesetOutcome } from '@cp/domain';

import { tripAccess } from '../../plan/access';
import {
  advance,
  applyToGroup,
  closeVote,
  lockChangeSet,
  OPEN_STATUSES,
  outcomeOf,
  requireVisibleChangeSet,
} from '../../plan/changeset-store';
import { bookingImpactOf } from '../../plan/providers';
import { applyPersonally, type PersonalApplyResult } from '../../plan/personal-apply';
import { defineCommand } from '../_framework/define-command';

export const applyChangesetCommand = defineCommand({
  name: 'apply_changeset',
  v: 1,
  schema: applyChangesetPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: async (tx, payload) => {
    await requireVisibleChangeSet(tx, payload.changeset_id);
    if (payload.scope === 'group') {
      const row = await lockChangeSet(tx, payload.changeset_id);
      if (!(await tripAccess(tx, row.trip_id)).organiser) {
        throw new DomainError('FORBIDDEN', { reason: 'organiser_only' });
      }
    }
  },
  handle: async (tx, payload, ctx): Promise<ChangesetOutcome & Partial<PersonalApplyResult>> => {
    let row = await lockChangeSet(tx, payload.changeset_id);
    if (payload.scope === 'personal') {
      const personal = await applyPersonally(tx, row, ctx.uid);
      return { ...(await outcomeOf(tx, row.id)), ...personal };
    }
    if (row.status === 'applied') return outcomeOf(tx, row.id);
    if (!OPEN_STATUSES.has(row.status)) {
      throw new DomainError('STATE_INVALID', { state: row.status });
    }
    if (row.status === 'voting') await closeVote(tx, row, 'approve', 'manual', ctx.uid);
    row = await advance(tx, row, ['proposed', 'approved'], { kind: 'organiser', uid: ctx.uid });
    await bookingImpactOf(tx, row);
    await applyToGroup(tx, row, { kind: 'user', id: ctx.uid });
    return outcomeOf(tx, row.id);
  },
});
