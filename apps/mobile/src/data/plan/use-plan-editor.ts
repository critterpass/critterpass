/**
 * The one way the plan screens change the plan. An organiser's edit goes out as `apply_plan_ops`
 * against the version they saw; a member's edit becomes a change set sent to the crew with the
 * default decider policy. Both wait in the offline queue.
 *
 * A queued edit the server answers with `PLAN_VERSION_CONFLICT{latest}` is rebased (planner rebase)
 * onto the latest version once it has synced and sent again, once; an edit that really collides
 * with someone else's is surfaced ("Maya moved this too"). An organiser who lost the role gets
 * `FORBIDDEN{use_changeset}` and their edit is proposed instead.
 */
/* eslint-disable lingui/no-unlocalized-strings -- wire codes and SQL, never copy. */
import { generateUuidV7, planOpsToEdits, type PlanOp, type PlanState } from '@cp/domain';
import { rebaseOps } from '@cp/planner';
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { useLocalFirst } from '@/data/powersync/local-first-context';
import { useRejectedCommands } from '@/data/status/use-rejected-commands';

import {
  applyChangesetCommand,
  applyPlanOpsCommand,
  createChangesetCommand,
  sendChangesetCommand,
} from './commands';
import type { DayItem } from './plan-model';
import { opTargets, removeOp, toChangeSetOps, type ChangeReasons } from './plan-ops';
import type { TripPlan } from './use-trip-plan';

interface InFlightEdit {
  readonly tripId: string;
  readonly baseState: PlanState;
  readonly ops: readonly PlanOp[];
  readonly confirmLocked: boolean;
  readonly retried: boolean;
}

/** Queued organiser edits by op id, so a conflict can be rebased while the app runs. */
const inFlight = new Map<string, InFlightEdit>();

export type EditOutcome =
  | { readonly kind: 'applied' }
  | { readonly kind: 'proposed'; readonly changesetId: string }
  | { readonly kind: 'unavailable' };

export interface PlanEditorEvents {
  /** Someone else changed the same items first; `by` is their name when known. */
  readonly onConflict: (stableIds: readonly string[], by: string | null) => void;
  readonly onLocked: (stableIds: readonly string[]) => void;
}

function detailOf(detail: unknown): Record<string, unknown> {
  return typeof detail === 'object' && detail !== null ? (detail as Record<string, unknown>) : {};
}

export function usePlanEditor(plan: TripPlan, reasons: ChangeReasons, events: PlanEditorEvents) {
  const { db } = useLocalFirst();
  const apply = useCommand(applyPlanOpsCommand);
  const create = useCommand(createChangesetCommand);
  const send = useCommand(sendChangesetCommand);
  const applySet = useCommand(applyChangesetCommand);
  const rejected = useRejectedCommands();
  const latest = useRef({ plan, reasons, events });
  useLayoutEffect(() => {
    latest.current = { plan, reasons, events };
  });

  const draft = useCallback(
    async (ops: readonly PlanOp[], state: PlanState): Promise<string | null> => {
      const { plan: current, reasons: why } = latest.current;
      const base = current.trip?.current_version_id ?? null;
      if (current.trip === null || base === null) return null;
      const changesetId = generateUuidV7();
      const changeOps = toChangeSetOps(
        ops,
        state,
        current.members.map((member) => member.uid),
        why,
      );
      if (changeOps.length === 0) return null;
      await create.send({
        changeset_id: changesetId,
        trip_id: current.trip.id,
        base_version: base,
        ops: changeOps,
        source: 'user',
        trigger: 'manual',
      });
      return changesetId;
    },
    [create],
  );

  const propose = useCallback(
    async (ops: readonly PlanOp[], state: PlanState): Promise<EditOutcome> => {
      const changesetId = await draft(ops, state);
      if (changesetId === null) return { kind: 'unavailable' };
      await send.send({ changeset_id: changesetId });
      return { kind: 'proposed', changesetId };
    },
    [draft, send],
  );

  /** "Just me": the item comes off my own plan only; the crew sees me skip it. */
  const skipForMe = useCallback(
    async (item: DayItem): Promise<boolean> => {
      const changesetId = await draft([removeOp(item)], latest.current.plan.state);
      if (changesetId === null) return false;
      await applySet.send({ changeset_id: changesetId, scope: 'personal' });
      return true;
    },
    [draft, applySet],
  );

  const submit = useCallback(
    async (
      ops: readonly PlanOp[],
      options: { readonly confirmLocked?: boolean } = {},
    ): Promise<EditOutcome> => {
      const { plan: current } = latest.current;
      const base = current.trip?.current_version_id ?? null;
      if (current.trip === null || base === null || ops.length === 0) {
        return { kind: 'unavailable' };
      }
      if (!current.canApply) return propose(ops, current.state);
      const confirmLocked = options.confirmLocked ?? false;
      const result = await apply.send({
        trip_id: current.trip.id,
        base_version: base,
        ops: [...ops],
        confirm_locked: confirmLocked,
      });
      inFlight.set(result.opId, {
        tripId: current.trip.id,
        baseState: current.synced,
        ops,
        confirmLocked,
        retried: false,
      });
      return { kind: 'applied' };
    },
    [apply, propose],
  );

  const whoChanged = useCallback(
    async (tripId: string, ids: readonly string[]): Promise<string | null> => {
      if (ids.length === 0) return null;
      const rows = await db.getAll<{ actor_id: string | null }>(
        `SELECT actor_id FROM activity_events
          WHERE trip_id = ? AND actor_kind = 'user' AND object_id IN (${ids.map(() => '?').join(', ')})
          ORDER BY at DESC LIMIT 1`,
        [tripId, ...ids],
      );
      const actor = rows[0]?.actor_id ?? null;
      const member = latest.current.plan.members.find((candidate) => candidate.uid === actor);
      return member?.name ?? null;
    },
    [db],
  );

  const version = plan.trip?.current_version_id ?? null;
  const loaded = plan.loaded;
  useEffect(() => {
    for (const rejection of rejected.items) {
      const edit = inFlight.get(rejection.opId);
      if (edit === undefined) continue;
      const detail = detailOf(rejection.detail);
      const { plan: current, events: on } = latest.current;
      if (rejection.code === 'PLAN_VERSION_CONFLICT') {
        const newest = typeof detail.latest === 'string' ? detail.latest : null;
        // Rebase against the version the server named, once it has synced here.
        if ((newest !== null && newest !== version) || !loaded) continue;
        inFlight.delete(rejection.opId);
        void rejected.dismiss(rejection.opId);
        const rebased = edit.retried
          ? null
          : rebaseOps(edit.ops, planOpsToEdits(edit.ops), edit.baseState, current.synced);
        if (rebased !== null && rebased.ok && version !== null) {
          void apply
            .send({
              trip_id: edit.tripId,
              base_version: version,
              ops: [...rebased.ops],
              confirm_locked: edit.confirmLocked,
            })
            .then((result) =>
              inFlight.set(result.opId, { ...edit, baseState: current.synced, retried: true }),
            );
        } else {
          const ids = rebased !== null && !rebased.ok ? rebased.conflicts : opTargets(edit.ops);
          void whoChanged(edit.tripId, ids).then((by) => on.onConflict(ids, by));
        }
        continue;
      }
      inFlight.delete(rejection.opId);
      if (rejection.code === 'FORBIDDEN' && detail.reason === 'use_changeset') {
        void rejected.dismiss(rejection.opId);
        void propose(edit.ops, edit.baseState);
      } else if (rejection.code === 'STATE_INVALID') {
        void rejected.dismiss(rejection.opId);
        on.onLocked(opTargets(edit.ops));
      }
    }
  }, [rejected, version, loaded, apply, propose, whoChanged]);

  return { submit, propose, skipForMe, pending: apply.pending || create.pending };
}
