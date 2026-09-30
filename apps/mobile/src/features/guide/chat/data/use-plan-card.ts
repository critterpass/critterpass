/**
 * A plan card's swaps (3j-1): each op of the guide's change set as the item it replaces (struck
 * through, with its time) and what comes in, named from the places the trip already has. Times
 * and prices come from the change set and the plan, never from the guide's words.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and wire values, never copy. */
import type { ChangeSetOpKind, ChangeSetStatus } from '@cp/domain';
import { useMemo } from 'react';

import { useLiveQuery } from './live-rows';

export interface PlanSwap {
  readonly target: string;
  readonly op: ChangeSetOpKind;
  readonly before: { readonly label: string | null; readonly startsAt: string | null } | null;
  readonly after: { readonly label: string | null; readonly startsAt: string | null } | null;
  readonly reason: string;
}

export interface PlanCardModel {
  readonly changesetId: string;
  readonly tripId: string;
  readonly status: ChangeSetStatus;
  readonly costDeltaMinor: number | null;
  readonly currency: string | null;
  readonly tz: string | null;
  readonly swaps: readonly PlanSwap[];
}

interface SetRow {
  readonly trip_id: string;
  readonly status: ChangeSetStatus;
  readonly ops: string | null;
  readonly cost_delta_minor: number | null;
  readonly currency: string | null;
  readonly tz: string | null;
}

interface NameRow {
  readonly id: string;
  readonly label: string | null;
  readonly starts_at: string | null;
}

interface RawOp {
  readonly op?: ChangeSetOpKind;
  readonly target?: string;
  readonly reason?: string;
  readonly accepted?: boolean;
  readonly after?: { poi_id?: string | null; notes?: string | null; starts_at?: string } | null;
}

const SET_SQL = `SELECT c.trip_id, c.status, c.ops, c.cost_delta_minor, t.local_currency AS currency, t.tz
  FROM change_sets c LEFT JOIN trips t ON t.id = c.trip_id WHERE c.id = ?`;

/** The current version's item for each stable id, by its place or booking name. */
const BEFORE_SQL = `SELECT pi.stable_id AS id, coalesce(p.name, b.title, pi.notes) AS label, pi.starts_at
  FROM plan_items pi
  JOIN trips t ON t.id = pi.trip_id AND t.current_version_id = pi.version_id
  LEFT JOIN pois p ON p.id = pi.poi_id
  LEFT JOIN bookings b ON b.id = pi.booking_id
  WHERE pi.trip_id = ?1 AND pi.stable_id IN (SELECT value FROM json_each(?2))`;

const POI_SQL = `SELECT id, name AS label, NULL AS starts_at FROM pois
  WHERE id IN (SELECT value FROM json_each(?1))`;

export function parseOps(ops: string | null): RawOp[] {
  if (ops === null) return [];
  try {
    const parsed = JSON.parse(ops) as unknown;
    return Array.isArray(parsed) ? (parsed as RawOp[]) : [];
  } catch {
    return [];
  }
}

export function buildSwaps(
  ops: readonly RawOp[],
  before: ReadonlyMap<string, NameRow>,
  pois: ReadonlyMap<string, NameRow>,
): PlanSwap[] {
  return ops.flatMap((op) => {
    if (op.op === undefined || op.target === undefined || op.accepted === false) return [];
    const was = op.op === 'add' ? undefined : before.get(op.target);
    const after = op.after ?? null;
    const poi =
      after?.poi_id === undefined || after.poi_id === null ? undefined : pois.get(after.poi_id);
    return [
      {
        target: op.target,
        op: op.op,
        before: was === undefined ? null : { label: was.label, startsAt: was.starts_at },
        after:
          op.op === 'remove' || after === null
            ? null
            : {
                label: poi?.label ?? after.notes ?? was?.label ?? null,
                startsAt: after.starts_at ?? was?.starts_at ?? null,
              },
        reason: op.reason ?? '',
      },
    ];
  });
}

export function usePlanCard(changesetId: string): PlanCardModel | null {
  const sets = useLiveQuery<SetRow>(SET_SQL, [changesetId], ['change_sets', 'trips']);
  const set = sets?.[0];
  const ops = useMemo(() => parseOps(set?.ops ?? null), [set?.ops]);
  const targets = JSON.stringify(ops.map((op) => op.target).filter(Boolean));
  const poiIds = JSON.stringify(
    ops.map((op) => op.after?.poi_id).filter((id): id is string => typeof id === 'string'),
  );
  const befores = useLiveQuery<NameRow>(
    set === undefined ? null : BEFORE_SQL,
    [set?.trip_id ?? null, targets],
    ['plan_items', 'pois', 'bookings', 'trips'],
  );
  const pois = useLiveQuery<NameRow>(set === undefined ? null : POI_SQL, [poiIds], ['pois']);
  return useMemo(() => {
    if (set === undefined) return null;
    const byId = (rows: readonly NameRow[] | null) =>
      new Map((rows ?? []).map((row) => [row.id, row] as const));
    return {
      changesetId,
      tripId: set.trip_id,
      status: set.status,
      costDeltaMinor: set.cost_delta_minor,
      currency: set.currency,
      tz: set.tz,
      swaps: buildSwaps(ops, byId(befores), byId(pois)),
    };
  }, [changesetId, set, ops, befores, pois]);
}
