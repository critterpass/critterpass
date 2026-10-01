/**
 * The organiser's current private draft from synced rows (the `trip_draft` stream): the version,
 * its days and items, the must-dos they place, every earlier draft for the history sheet, the
 * trip's last drafting job (for a draft that failed before any version existed) and a redraft
 * still waiting on the organiser. All of it works offline once synced.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and wire values, never copy. */
import { useMemo } from 'react';

import { guideText } from '@/lib/i18n/guide-text';
import { useActiveLocale } from '@/lib/i18n/use-locale';

import type { DraftTrip } from './draft-trip';
import { useLiveRows } from './rows';
import {
  buildReview,
  type DayRow,
  type ItemRow,
  type MustDoRow,
  type ReviewModel,
  type VersionRow,
} from './version';

export interface HistoryEntry {
  readonly id: string;
  readonly createdAt: string;
  readonly current: boolean;
  readonly days: number;
  readonly costPpMinor: number | null;
  readonly currency: string | null;
}

export interface OpenRedraft {
  readonly id: string;
  readonly status: string;
  readonly dayNo: number | null;
}

export interface DraftVersionView {
  readonly loaded: boolean;
  readonly review: ReviewModel | null;
  readonly history: readonly HistoryEntry[];
  /** The newest drafting job's status (a draft that never produced a version shows it). */
  readonly lastDraftJob: { readonly id: string; readonly status: string } | null;
  readonly openRedraft: OpenRedraft | null;
}

const VERSION_SQL = `SELECT id, status, parent_id, created_at, cost_pp_minor, currency, metrics, coverage
  FROM itinerary_versions WHERE id = ?`;
const DAYS_SQL = `SELECT id, day_no, date, theme, i18n FROM plan_days WHERE version_id = ? ORDER BY day_no`;
const ITEMS_SQL = `SELECT day_id, stable_id, starts_at, tz, poi_id, must_do_id, category, booking_id, locked_reason
  FROM plan_items WHERE version_id = ?`;
const MUST_DOS_SQL = `SELECT id, owner_id, title, external_action, external_deadline FROM must_dos
  WHERE trip_id = ?`;
const HISTORY_SQL = `SELECT v.id, v.created_at, v.cost_pp_minor, v.currency,
    (SELECT count(*) FROM plan_days d WHERE d.version_id = v.id) AS days
  FROM itinerary_versions v
  WHERE v.trip_id = ? AND v.visibility = 'organiser' AND v.status IN ('draft', 'superseded')
  ORDER BY v.created_at DESC`;
const JOBS_SQL = `SELECT id, kind, status, input_hash, result_ref FROM agent_jobs
  WHERE trip_id = ? AND kind IN ('draft', 'redraft') ORDER BY created_at DESC LIMIT 6`;
const RESERVED_SQL = `SELECT agent_job_id FROM redraft_reservations WHERE trip_id = ? AND status = 'reserved'`;

interface HistoryRow {
  readonly id: string;
  readonly created_at: string;
  readonly cost_pp_minor: number | null;
  readonly currency: string | null;
  readonly days: number;
}

interface JobRow {
  readonly id: string;
  readonly kind: string;
  readonly status: string;
  readonly result_ref: string | null;
}

function dayOf(resultRef: string | null): number | null {
  try {
    const parsed = JSON.parse(resultRef ?? 'null') as { day_no?: unknown } | null;
    return typeof parsed?.day_no === 'number' ? parsed.day_no : null;
  } catch {
    return null;
  }
}

export function useDraftVersion(trip: DraftTrip | null | undefined): DraftVersionView {
  const tripId = trip?.tripId ?? null;
  const versionId = trip?.draftVersionId ?? null;
  const byVersion = versionId === null ? null : [versionId];
  const byTrip = tripId === null ? null : [tripId];
  const version = useLiveRows<VersionRow>(VERSION_SQL, byVersion, ['itinerary_versions']);
  const days = useLiveRows<DayRow>(DAYS_SQL, byVersion, ['plan_days']);
  const items = useLiveRows<ItemRow>(ITEMS_SQL, byVersion, ['plan_items']);
  const mustDos = useLiveRows<MustDoRow>(MUST_DOS_SQL, byTrip, ['must_dos']);
  const history = useLiveRows<HistoryRow>(HISTORY_SQL, byTrip, ['itinerary_versions', 'plan_days']);
  const jobs = useLiveRows<JobRow>(JOBS_SQL, byTrip, ['agent_jobs']);
  const locale = useActiveLocale();
  const reserved = useLiveRows<{ agent_job_id: string }>(RESERVED_SQL, byTrip, [
    'redraft_reservations',
  ]);

  const review = useMemo(() => {
    const row = version.rows[0];
    if (trip === undefined || trip === null || row === undefined) return null;
    return buildReview({
      version: row,
      // The organiser reviews the draft in their own language: each day's theme as they read it.
      days: days.rows.map((day) => ({
        ...day,
        theme: guideText('plan_day', day, 'theme', locale),
      })),
      items: items.rows,
      mustDos: mustDos.rows,
      people: trip.people,
      setup: trip.setup,
    });
  }, [trip, version.rows, days.rows, items.rows, mustDos.rows, locale]);

  const openRedraft = useMemo((): OpenRedraft | null => {
    const waiting = new Set(reserved.rows.map((r) => r.agent_job_id));
    const job = jobs.rows.find(
      (row) =>
        row.kind === 'redraft' &&
        (row.status === 'queued' || row.status === 'running' || waiting.has(row.id)),
    );
    return job === undefined
      ? null
      : { id: job.id, status: job.status, dayNo: dayOf(job.result_ref) };
  }, [jobs.rows, reserved.rows]);

  const draftJob = jobs.rows.find((row) => row.kind === 'draft');
  return {
    loaded:
      trip !== undefined &&
      (versionId === null || (version.loaded && days.loaded && items.loaded)) &&
      (tripId === null || (mustDos.loaded && jobs.loaded)),
    review,
    history: history.rows.map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      current: row.id === versionId,
      days: row.days,
      costPpMinor: row.cost_pp_minor,
      currency: row.currency,
    })),
    lastDraftJob: draftJob === undefined ? null : { id: draftJob.id, status: draftJob.status },
    openRedraft,
  };
}
