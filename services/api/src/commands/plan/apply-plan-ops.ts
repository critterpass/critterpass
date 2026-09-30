/**
 * `apply_plan_ops` (docs/api-contracts.md §4.6): an organiser's drag, resize, add, remove or day
 * reorder, committed as one new plan version. Members get `FORBIDDEN{use_changeset}` so the client
 * wraps their edit in a change set; a stale base answers `PLAN_VERSION_CONFLICT{latest}`; locked
 * items need `confirm_locked` and a booked day never moves.
 */
import { applyPlanOpsPayloadSchema, planOpsToEdits } from '@cp/domain';

import { defineCommand } from '../_framework/define-command';
import { requirePlanEditor } from '../../plan/access';
import { assertLockRules } from '../../plan/lock-rules';
import {
  assertCurrentBase,
  commitPlanVersion,
  loadPlanState,
  lockTripPlan,
  replay,
} from '../../plan/versioning';

export const applyPlanOpsCommand = defineCommand({
  name: 'apply_plan_ops',
  v: 1,
  schema: applyPlanOpsPayloadSchema,
  offline: true,
  allowAnonymous: true,
  authorize: (tx, payload) => requirePlanEditor(tx, payload.trip_id),
  handle: async (tx, payload, ctx): Promise<{ version_id: string }> => {
    const head = await lockTripPlan(tx, payload.trip_id);
    const base = assertCurrentBase(head, payload.base_version);
    const state = await loadPlanState(tx, base);
    assertLockRules(state, payload.ops, payload.confirm_locked);
    const next = replay(state, planOpsToEdits(payload.ops));
    const versionId = await commitPlanVersion(tx, {
      head,
      baseVersionId: base,
      next,
      actor: { kind: 'user', id: ctx.uid },
      source: 'ops',
      opCount: payload.ops.length,
      ops: payload.ops,
    });
    return { version_id: versionId };
  },
});
