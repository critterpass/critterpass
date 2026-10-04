/**
 * The trip's plan check (7h-1, 7a-1 "Three things to fix", 7a-3 "3 things to fix, 2 to know"): the
 * latest run and its issues for the version it checked, in the order the check ranked them. Synced
 * rows; an issue the app can't read (a kind a newer server added) is left out rather than shown
 * wrong.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { planCheckIssueSchema, type PlanCheckIssue } from '@cp/domain';
import { useMemo } from 'react';

import { useLiveRows } from '@/data/plan/live-rows';

export const CHECK_SQL = `SELECT trip_id, version_id, status, checked_at, fix_count, know_count
  FROM plan_checks WHERE trip_id = ? ORDER BY updated_at DESC LIMIT 1`;
export const ISSUES_SQL = `SELECT id, trip_id, version_id, kind, severity, day_id, stable_ids, params,
    fix, rank, fingerprint
  FROM plan_check_issues WHERE trip_id = ? AND version_id = ? ORDER BY rank, id`;
const CHECK_TABLES = ['plan_checks'];
const ISSUES_TABLES = ['plan_check_issues'];

export interface CheckRow {
  readonly trip_id: string;
  readonly version_id: string | null;
  readonly status: string;
  readonly checked_at: string | null;
  readonly fix_count: number | null;
  readonly know_count: number | null;
}

export interface IssueRow {
  readonly id: string;
  readonly trip_id: string;
  readonly version_id: string;
  readonly kind: string;
  readonly severity: string;
  readonly day_id: string | null;
  readonly stable_ids: string | null;
  readonly params: string | null;
  readonly fix: string | null;
  readonly rank: number;
  readonly fingerprint: string;
}

export interface PlanCheckView {
  readonly loaded: boolean;
  readonly check: CheckRow | null;
  /** Issues to fix first, then things to know, each in the check's rank order. */
  readonly fixes: readonly PlanCheckIssue[];
  readonly know: readonly PlanCheckIssue[];
}

function json(raw: string | null): unknown {
  if (raw === null || raw === '') return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

export function issuesFrom(rows: readonly IssueRow[]): PlanCheckIssue[] {
  return rows.flatMap((row) => {
    const parsed = planCheckIssueSchema.safeParse({
      ...row,
      stable_ids: json(row.stable_ids) ?? [],
      params: json(row.params) ?? {},
      fix: json(row.fix),
    });
    return parsed.success ? [parsed.data] : [];
  });
}

export function usePlanCheck(tripId: string | null): PlanCheckView {
  const checks = useLiveRows<CheckRow>(CHECK_SQL, tripId === null ? null : [tripId], CHECK_TABLES);
  const check = checks.rows[0] ?? null;
  const version = check?.version_id ?? null;
  const issues = useLiveRows<IssueRow>(
    ISSUES_SQL,
    tripId === null || version === null ? null : [tripId, version],
    ISSUES_TABLES,
  );
  return useMemo(() => {
    const all = issuesFrom(issues.rows);
    return {
      loaded: checks.loaded && (version === null || issues.loaded),
      check,
      fixes: all.filter((issue) => issue.severity === 'fix'),
      know: all.filter((issue) => issue.severity === 'know'),
    };
  }, [check, checks.loaded, issues.loaded, issues.rows, version]);
}
