/**
 * The trip's plan check (7h-1, 7a-1 "Three things to fix", 7a-3 "3 things to fix, 2 to know"): the
 * latest run and its issues for the version it checked, in the order the check ranked them. Synced
 * rows; an issue the app can't read (a kind a newer server added) is left out rather than shown
 * wrong. Before the crew has a plan an organiser sees the check of her own draft instead.
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
  /**
   * The check is waiting for its next run (the plan changed and its legs are being stored): the
   * counts and issues are what is known so far, of days the change did not touch.
   */
  readonly checking: boolean;
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

/** A row whose run is queued or under way; the counts on it are the last known ones. */
export function isChecking(check: Pick<CheckRow, 'status'> | null): boolean {
  return check?.status === 'queued' || check?.status === 'running';
}

/** The organiser's own draft as the check sees it: when it was last checked, and its stops. */
export const DRAFT_CHECK_SQL = `SELECT v.checked_at,
    (SELECT count(*) FROM plan_items i WHERE i.version_id = v.id) AS stops
  FROM itinerary_versions v WHERE v.id = ?`;
const DRAFT_CHECK_TABLES = ['itinerary_versions', 'plan_items'];

export interface DraftCheckRow {
  readonly checked_at: string | null;
  readonly stops: number;
}

/**
 * The check of an organiser's own draft, in the shape of the crew's: the trip-wide row says
 * nothing of a private draft, so the run is read from the draft itself (its stamp) and the counts
 * from its own issues. A draft with stops and no stamp yet is waiting for its run; one with no
 * stops has nothing to check.
 */
export function draftCheckRow(
  tripId: string,
  versionId: string,
  draft: DraftCheckRow | null,
  issues: readonly Pick<PlanCheckIssue, 'severity'>[],
): CheckRow {
  const fixes = issues.filter((issue) => issue.severity === 'fix').length;
  const checked = draft?.checked_at ?? null;
  return {
    trip_id: tripId,
    version_id: versionId,
    status: checked !== null || (draft?.stops ?? 0) === 0 ? 'done' : 'queued',
    checked_at: checked,
    fix_count: fixes,
    know_count: issues.length - fixes,
  };
}

/**
 * `draftVersionId`: the organiser's own draft when that is the plan on screen (the crew has none
 * yet); the check shown is then the draft's, which only she receives.
 */
export function usePlanCheck(
  tripId: string | null,
  draftVersionId: string | null = null,
): PlanCheckView {
  const onDraft = tripId !== null && draftVersionId !== null;
  const checks = useLiveRows<CheckRow>(
    CHECK_SQL,
    tripId === null || onDraft ? null : [tripId],
    CHECK_TABLES,
  );
  const drafts = useLiveRows<DraftCheckRow>(
    DRAFT_CHECK_SQL,
    onDraft ? [draftVersionId] : null,
    DRAFT_CHECK_TABLES,
  );
  const crewCheck = checks.rows[0] ?? null;
  const version = onDraft ? draftVersionId : (crewCheck?.version_id ?? null);
  const issues = useLiveRows<IssueRow>(
    ISSUES_SQL,
    tripId === null || version === null ? null : [tripId, version],
    ISSUES_TABLES,
  );
  const draft = drafts.rows[0] ?? null;
  return useMemo(() => {
    const all = issuesFrom(issues.rows);
    const check = onDraft ? draftCheckRow(tripId, draftVersionId, draft, all) : crewCheck;
    return {
      loaded: (onDraft ? drafts.loaded : checks.loaded) && (version === null || issues.loaded),
      check,
      checking: isChecking(check),
      fixes: all.filter((issue) => issue.severity === 'fix'),
      know: all.filter((issue) => issue.severity === 'know'),
    };
  }, [
    onDraft,
    tripId,
    draftVersionId,
    draft,
    crewCheck,
    checks.loaded,
    drafts.loaded,
    issues.loaded,
    issues.rows,
    version,
  ]);
}
