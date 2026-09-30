/**
 * `propose_plan_changes` for the guide (docs/api-contracts.md §6): the guide's plan changes become a
 * draft change set through `create_changeset`, run as the asking member (their RLS, their name),
 * never as the system and never applied: the crew reviews it, votes on it (PROPOSE TO GROUP) or the
 * asker keeps it for their own day (JUST ME). A stale base version or an unknown item fails the
 * tool, and the guide says it cannot make that change.
 */
import type { ToolContext, ToolInput, ToolRegistry } from '@cp/ai';
import { executeCommand } from '@cp/db';
import {
  DomainError,
  generateStableId,
  generateUuidV7,
  type ChangeSetOp,
  type CommandDevice,
  type CreateChangesetPayload,
} from '@cp/domain';
import type pg from 'pg';

import type { CommandRegistry } from '../_framework/registry';

const GUIDE_DEVICE: CommandDevice = {
  id: 'guide',
  platform: 'web',
  app_version: 'server',
  tz: 'UTC',
};

/** The guide's proposed ops as change set ops: an `add` gets a fresh stable id. */
export function toChangeSetOps(ops: ToolInput<'propose_plan_changes'>['ops']): ChangeSetOp[] {
  return ops.map((op) => ({
    op: op.op,
    target: op.item ?? generateStableId(),
    ...(op.new === undefined ? {} : { after: op.new }),
    reason: op.reason,
    affected_user_ids: op.new?.attendee_ids ?? [],
    booking_impact: false,
    ...(op.source_ids.length === 0 ? {} : { source_ids: op.source_ids }),
  }));
}

export async function proposePlanChanges(
  deps: { readonly pool: pg.Pool; readonly commands: CommandRegistry },
  input: ToolInput<'propose_plan_changes'>,
  context: ToolContext,
) {
  if (context.tripId === null) throw new Error('plan changes need a trip in context');
  const payload: CreateChangesetPayload = {
    changeset_id: generateUuidV7(),
    trip_id: context.tripId,
    base_version: input.base_version,
    ops: toChangeSetOps(input.ops),
    source: 'guide_suggestion',
    trigger: 'chat',
  };
  const outcome = await executeCommand(
    {
      op_id: generateUuidV7(),
      cmd: 'create_changeset',
      v: 1,
      actor: { uid: context.uid, via: 'app' },
      device: GUIDE_DEVICE,
      client_ts: new Date().toISOString(),
      payload,
    },
    {
      pool: deps.pool,
      resolve: deps.commands.resolve,
      actor: { kind: 'user', uid: context.uid, isAnonymous: false },
      door: 'cmd',
    },
  );
  if (outcome.status === 'rejected') throw new DomainError(outcome.code, outcome.detail);
  const result = outcome.result as { change_set_id: string };
  return { changeset_id: result.change_set_id, violations: [], cost_delta: null };
}

export function registerProposePlanChanges(
  registry: ToolRegistry,
  deps: { readonly pool: pg.Pool; readonly commands: CommandRegistry },
): void {
  registry.registerToolExecutor('propose_plan_changes', (input, context) =>
    proposePlanChanges(deps, input, context),
  );
}
