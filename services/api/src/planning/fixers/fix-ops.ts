/**
 * The ops a plan check issue's fix makes, worked out on the plan the caller sees now: a one-tap
 * fix carries its own ops; Less driving is the day's best order, Rain and crowds the day's swaps,
 * and Too far the swap of one stop for a nearer place of its kind. Every fix is timed on real
 * travel first (`road-timed.ts`): one that would leave a stop it moves in a clash is no fix. FIX
 * ALL gathers several issues' ops into one set, the worst issue first, never touching one stop
 * twice and never adding a fix that clashes with the ones before it.
 */
import { checkFixSchema, DomainError, type ChangeSetOp, type CheckFix } from '@cp/domain';
import {
  reorderDay,
  swapDay,
  tooFarAlternative,
  type FitPoint,
  type TooFarAlternative,
} from '@cp/planner';
import type pg from 'pg';

import type { LoadedCheckInput } from './check-input';
import { settle, type Roads } from './road-timed';
import { tooFarCandidates } from './too-far-candidates';

export interface IssueRow {
  readonly id: string;
  readonly trip_id: string;
  readonly version_id: string;
  readonly kind: string;
  readonly day_id: string | null;
  readonly rank: number;
  readonly fix: CheckFix | null;
}

/** The issue as the caller sees it (RLS: participants of its trip), or `NOT_FOUND`. */
export async function readIssue(tx: pg.PoolClient, issueId: string): Promise<IssueRow> {
  const { rows } = await tx.query<IssueRow & { fix: unknown }>(
    `SELECT id, trip_id, version_id, kind, day_id, rank, fix FROM plan_check_issues WHERE id = $1`,
    [issueId],
  );
  const row = rows[0];
  if (row === undefined) throw new DomainError('NOT_FOUND', { reason: 'issue' });
  const fix = checkFixSchema.safeParse(row.fix);
  return { ...row, fix: fix.success ? fix.data : null };
}

export interface IssueFix {
  readonly ops: readonly ChangeSetOp[];
  /** Every leg of the days it touches is a routed one, not a guess. */
  readonly checked: boolean;
  /** Where a swapped stop now is, by stable id. */
  readonly points?: ReadonlyMap<string, FitPoint>;
}

/**
 * An issue's fix on the plan as it is now, or null when it has none or its result would leave a
 * clash on the times it was checked with.
 */
export async function fixForIssue(
  tx: pg.PoolClient,
  issue: IssueRow,
  check: LoadedCheckInput,
  roads: Roads,
  options: { readonly screens: boolean },
): Promise<IssueFix | null> {
  const fix = issue.fix;
  if (fix === null || fix.kind === 'none') return null;
  if (fix.kind === 'apply') {
    const { ops } = fix;
    const settled = await settle(roads, () => ({ ops }));
    return settled === null ? null : { ops, checked: settled.checked };
  }
  const dayId = issue.day_id;
  if (dayId === null) return null;
  switch (fix.screen) {
    case 'too_far': {
      const day = check.input.context.days.find((entry) => entry.dayId === dayId);
      if (day === undefined) return null;
      const { candidates } = await tooFarCandidates(tx, check.trip.destinationId, day);
      const pointsOf = (swap: TooFarAlternative) => {
        const point = candidates.find((entry) => entry.poiId === swap.poiId)?.point;
        return point === undefined ? undefined : new Map([[swap.stableId, point]]);
      };
      const settled = await settle<TooFarAlternative & { ops: ChangeSetOp[] }>(
        roads,
        (input) => {
          const alternative = tooFarAlternative(input, dayId, candidates);
          return alternative === null ? null : { ...alternative, ops: [alternative.op] };
        },
        pointsOf,
      );
      if (settled === null) return null;
      const points = pointsOf(settled.fix);
      return {
        ops: settled.fix.ops,
        checked: settled.checked,
        ...(points === undefined ? {} : { points }),
      };
    }
    case 'less_driving': {
      if (!options.screens) return null;
      const settled = await settle(roads, (input) => reorderDay(input, dayId));
      return settled === null || settled.fix.ops.length === 0
        ? null
        : { ops: settled.fix.ops, checked: settled.checked };
    }
    case 'rain_crowds': {
      if (!options.screens) return null;
      const settled = await settle(roads, (input) => swapDay(input, dayId));
      return settled === null || settled.fix.ops.length === 0
        ? null
        : { ops: settled.fix.ops, checked: settled.checked };
    }
    case 'fill_gap':
      return null;
  }
}

/**
 * Every issue's ops in rank order; a stop an earlier fix already moves is left as that fix has it,
 * and a fix that would clash with the ones gathered before it is left out.
 */
export async function gatherOps(
  tx: pg.PoolClient,
  issues: readonly IssueRow[],
  check: LoadedCheckInput,
  roads: Roads,
): Promise<ChangeSetOp[]> {
  const ops: ChangeSetOp[] = [];
  const touched = new Set<string>();
  const points = new Map<string, FitPoint>();
  for (const issue of [...issues].sort((a, b) => a.rank - b.rank)) {
    const mine = await fixForIssue(tx, issue, check, roads, { screens: true });
    const fresh = (mine?.ops ?? []).filter((op) => !touched.has(op.target));
    if (fresh.length === 0) continue;
    const together = new Map([...points, ...(mine?.points ?? [])]);
    if (roads.verdict([...ops, ...fresh], together).clash) continue;
    for (const op of fresh) touched.add(op.target);
    for (const [stableId, point] of mine?.points ?? []) points.set(stableId, point);
    ops.push(...fresh);
  }
  return ops;
}
