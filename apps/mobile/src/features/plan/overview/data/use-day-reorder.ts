/**
 * Day reorder writes (3e-1). An organiser's drop queues one `apply_plan_ops{reorder_days}` against
 * the version on screen and shows the new order at once, offline too, until the new version syncs.
 * A version conflict (someone else changed the plan first) is replayed once on the latest version
 * when the same days are still there; a second conflict surfaces as the conflict state. A member's
 * drop becomes a change set of the moves it implies and opens the review screen to send it.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, command names and wire codes, never copy. */
import { t } from '@lingui/core/macro';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { generateUuidV7, type PlanState } from '@cp/domain';

import { LocalFirstContext } from '@/data/powersync/local-first-context';

import { CREATE_CHANGESET } from '../../review/data/changeset-commands';
import { reorderChangeSetOps, reorderPlanOp } from '../model/reorder';
import { useLiveRows } from './live-rows';
import { APPLY_PLAN_OPS } from './plan-commands';

const PENDING_SQL = `SELECT id, envelope FROM commands
  WHERE cmd = 'apply_plan_ops' AND status <> 'done'
    AND json_extract(envelope, '$.payload.trip_id') = ?
  ORDER BY seq`;
const REJECTED_SQL = `SELECT id, code FROM rejected_commands
  WHERE cmd = 'apply_plan_ops' ORDER BY rejected_at DESC LIMIT 5`;

interface PendingRow {
  readonly id: string;
  readonly envelope: string;
}

/** The order of the newest queued reorder made on `versionId`, if any. */
export function pendingOrder(
  rows: readonly PendingRow[],
  versionId: string | null,
): number[] | null {
  let order: number[] | null = null;
  for (const row of rows) {
    try {
      const payload = (
        JSON.parse(row.envelope) as {
          payload: { base_version: string; ops: { op: string; new?: { order?: number[] } }[] };
        }
      ).payload;
      if (payload.base_version !== versionId) continue;
      for (const op of payload.ops) {
        if (op.op === 'reorder_days' && Array.isArray(op.new?.order)) order = op.new.order;
      }
    } catch {
      // an unreadable envelope says nothing about the order
    }
  }
  return order;
}

export type ReorderOutcome =
  | { readonly kind: 'queued' }
  | { readonly kind: 'review'; readonly changesetId: string }
  | { readonly kind: 'failed' };

export interface DayReorder {
  /** The order to show while a reorder is on its way, else null (show the synced order). */
  readonly pending: readonly number[] | null;
  readonly conflict: boolean;
  readonly dismissConflict: () => void;
  readonly reorder: (order: readonly number[]) => Promise<ReorderOutcome>;
}

export function useDayReorder(input: {
  readonly tripId: string | null;
  readonly versionId: string | null;
  readonly organiser: boolean;
  readonly state: PlanState;
}): DayReorder {
  const commands = useContext(LocalFirstContext)?.commands ?? null;
  const { tripId, versionId, organiser, state } = input;
  const pendingRows = useLiveRows<PendingRow>(PENDING_SQL, tripId === null ? null : [tripId], [
    'commands',
  ]);
  const rejected = useLiveRows<{ id: string; code: string }>(
    REJECTED_SQL,
    [],
    ['rejected_commands'],
  );
  const [conflict, setConflict] = useState(false);
  // What I last sent, shown until its version syncs (the queued row is gone once it uploads).
  const [sent, setSent] = useState<{ versionId: string; order: readonly number[] } | null>(null);
  const last = useRef<{ opId: string; order: readonly number[]; retried: boolean } | null>(null);

  const send = useCallback(
    async (order: readonly number[], retried: boolean) => {
      if (commands === null || tripId === null || versionId === null) return null;
      const result = await commands.send(APPLY_PLAN_OPS, {
        trip_id: tripId,
        base_version: versionId,
        ops: [reorderPlanOp(order)],
        confirm_locked: false,
      });
      last.current = { opId: result.opId, order, retried };
      setSent({ versionId, order });
      return result;
    },
    [commands, tripId, versionId],
  );

  // A conflict on my own reorder: replay it once on the latest version, then surface it.
  useEffect(() => {
    const mine = last.current;
    if (mine === null) return;
    const hit = rejected.rows.find((row) => row.id === mine.opId);
    if (hit === undefined) return;
    last.current = null;
    setSent(null);
    const sameDays =
      [...mine.order].sort((a, b) => a - b).join() ===
      state.days
        .map((day) => day.day_no)
        .sort((a, b) => a - b)
        .join();
    if (hit.code === 'PLAN_VERSION_CONFLICT' && !mine.retried && sameDays) {
      void send(mine.order, true);
    } else {
      setConflict(true);
    }
  }, [rejected.rows, send, state.days]);

  const reorder = useCallback(
    async (order: readonly number[]): Promise<ReorderOutcome> => {
      if (commands === null || tripId === null || versionId === null) return { kind: 'failed' };
      setConflict(false);
      if (organiser) {
        const result = await send(order, false);
        return result === null || result.kind === 'rejected'
          ? { kind: 'failed' }
          : { kind: 'queued' };
      }
      const ops = reorderChangeSetOps(
        state,
        order,
        t({ id: 'plan.overview.reorderReason', message: 'Days swapped around.' }),
      );
      if (ops.length === 0) return { kind: 'failed' };
      const changesetId = generateUuidV7();
      const created = await commands.send(CREATE_CHANGESET, {
        changeset_id: changesetId,
        trip_id: tripId,
        base_version: versionId,
        ops,
        source: 'user',
        trigger: 'manual',
      });
      return created.kind === 'applied' ? { kind: 'review', changesetId } : { kind: 'failed' };
    },
    [commands, organiser, send, state, tripId, versionId],
  );

  const pending = useMemo(
    () =>
      pendingOrder(pendingRows.rows, versionId) ??
      (sent !== null && sent.versionId === versionId ? sent.order : null),
    [pendingRows.rows, versionId, sent],
  );
  return { pending, conflict, dismissConflict: () => setConflict(false), reorder };
}
