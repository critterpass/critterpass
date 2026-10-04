/**
 * The ops a plan check issue's fix makes, worked out on the plan the caller sees now: a one-tap
 * fix carries its own ops; Less driving is the day's best order, Rain and crowds the day's swaps,
 * and Too far the swap of one stop for a nearer place of its kind. FIX ALL gathers several issues'
 * ops into one set, the worst issue first, never touching one stop twice.
 */
import { checkFixSchema, DomainError, type ChangeSetOp, type CheckFix } from '@cp/domain';
import { reorderDay, swapDay, tooFarAlternative } from '@cp/planner';
import type pg from 'pg';

import type { LoadedCheckInput } from './check-input';
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

/** The ops of an issue's fix, or null when it has none on the plan as it is now. */
export async function opsForIssue(
  tx: pg.PoolClient,
  issue: IssueRow,
  check: LoadedCheckInput,
  options: { readonly screens: boolean },
): Promise<readonly ChangeSetOp[] | null> {
  const fix = issue.fix;
  if (fix === null || fix.kind === 'none') return null;
  if (fix.kind === 'apply') return fix.ops;
  const dayId = issue.day_id;
  if (dayId === null) return null;
  switch (fix.screen) {
    case 'too_far': {
      const day = check.input.context.days.find((entry) => entry.dayId === dayId);
      if (day === undefined) return null;
      const { candidates } = await tooFarCandidates(tx, check.trip.destinationId, day);
      const alternative = tooFarAlternative(check.input, dayId, candidates);
      return alternative === null ? null : [alternative.op];
    }
    case 'less_driving': {
      if (!options.screens) return null;
      const ops = reorderDay(check.input, dayId)?.ops ?? [];
      return ops.length === 0 ? null : ops;
    }
    case 'rain_crowds': {
      if (!options.screens) return null;
      const ops = swapDay(check.input, dayId)?.ops ?? [];
      return ops.length === 0 ? null : ops;
    }
    case 'fill_gap':
      return null;
  }
}

/** Every issue's ops in rank order; a stop an earlier fix already moves is left as that fix has it. */
export async function gatherOps(
  tx: pg.PoolClient,
  issues: readonly IssueRow[],
  check: LoadedCheckInput,
): Promise<ChangeSetOp[]> {
  const ops: ChangeSetOp[] = [];
  const touched = new Set<string>();
  for (const issue of [...issues].sort((a, b) => a.rank - b.rank)) {
    const mine = await opsForIssue(tx, issue, check, { screens: true });
    const fresh = (mine ?? []).filter((op) => !touched.has(op.target));
    for (const op of fresh) touched.add(op.target);
    ops.push(...fresh);
  }
  return ops;
}
