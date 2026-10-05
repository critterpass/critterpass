/**
 * One redraft, live: its job (synced row, `redraft.result` on `trip_draft:{trip_id}`, and a
 * `GET /v1/jobs/{id}` poll while it runs), the server's diff once it is delivered, the names of
 * the places both versions name, the day's title before and after the redraft and whether the
 * organiser has already kept or put it back (its reservation settled). The guide writes in
 * English; titles and each change's reason are read in the organiser's language from the synced
 * rows of both versions as soon as their translations are in.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, paths and wire values, never copy. */
import {
  DRAFT_RT,
  draftCoverageSchema,
  redraftResultSchema,
  type DraftPlace,
  type RedraftResult,
} from '@cp/domain';
import { useEffect, useMemo, useReducer, useState } from 'react';

import { useChannel } from '@/data/realtime/use-channel';
import { guideText } from '@/lib/i18n/guide-text';
import { useActiveLocale } from '@/lib/i18n/use-locale';

import type { JobStatus } from './job';
import { parseJson, useLiveRows } from './rows';
import { useDraftServices } from './services';
import { POLL_MS } from './use-draft-job';

export interface RedraftView {
  readonly loaded: boolean;
  readonly status: JobStatus | null;
  readonly result: RedraftResult | null;
  readonly places: Readonly<Record<string, DraftPlace>>;
  /** The day's title in the draft the redraft was asked against, as the organiser reads it. */
  readonly baseTitle: string | null;
  /** The redrafted day's title as the organiser reads it (null until its row has synced). */
  readonly newTitle: string | null;
  /** Stable id → the guide's reason for the redrafted stop, where it has been translated. */
  readonly reasons: ReadonlyMap<string, string>;
  /** `committed` once kept or put back, `released` when it did not count. */
  readonly settled: string | null;
}

const JOB_SQL = 'SELECT id, status, result_ref FROM agent_jobs WHERE id = ?';
const RESERVATION_SQL = 'SELECT status FROM redraft_reservations WHERE agent_job_id = ?';
const VERSIONS_SQL = 'SELECT id, coverage FROM itinerary_versions WHERE id IN (?, ?)';
const DAY_SQL = 'SELECT theme, i18n FROM plan_days WHERE version_id = ? AND day_no = ?';
const NOTES_SQL = `SELECT i.stable_id, i.notes, i.i18n FROM plan_items i
  JOIN plan_days d ON d.id = i.day_id
  WHERE i.version_id = ? AND d.day_no = ? AND i.notes IS NOT NULL`;

interface DayTitleRow {
  readonly theme: string | null;
  readonly i18n: string | null;
}

interface NoteRow {
  readonly stable_id: string;
  readonly notes: string | null;
  readonly i18n: string | null;
}

const STATUSES: ReadonlySet<string> = new Set([
  'queued',
  'running',
  'succeeded',
  'failed',
  'cancelled',
]);

function resultOf(value: unknown): RedraftResult | null {
  const parsed = redraftResultSchema.safeParse(
    typeof value === 'string' ? parseJson(value, null) : value,
  );
  return parsed.success ? parsed.data : null;
}

export function useRedraft(tripId: string, redraftId: string): RedraftView {
  const { getJson } = useDraftServices();
  const job = useLiveRows<{ status: string; result_ref: string | null }>(
    JOB_SQL,
    [redraftId],
    ['agent_jobs'],
  );
  const reservation = useLiveRows<{ status: string }>(
    RESERVATION_SQL,
    [redraftId],
    ['redraft_reservations'],
  );
  const [polled, setPolled] = useState<{ status: JobStatus; result: RedraftResult | null } | null>(
    null,
  );
  const [tick, poke] = useReducer((n: number) => n + 1, 0);

  const row = job.rows[0];
  const syncedStatus =
    row !== undefined && STATUSES.has(row.status) ? (row.status as JobStatus) : null;
  const syncedResult = useMemo(() => resultOf(row?.result_ref ?? null), [row?.result_ref]);
  const status =
    syncedStatus === 'succeeded' || syncedStatus === 'failed'
      ? syncedStatus
      : (polled?.status ?? syncedStatus);
  const result = syncedResult ?? polled?.result ?? null;

  useChannel('trip_draft', tripId, {
    onEvent: (envelope) => {
      const id = (envelope.data as { redraft_id?: unknown } | null)?.redraft_id;
      if (envelope.type === DRAFT_RT.redraftResult && id === redraftId) poke();
    },
    onSubscribed: poke,
  });

  const live = status === null || status === 'queued' || status === 'running';
  useEffect(() => {
    if (!live) return undefined;
    let stopped = false;
    const poll = () => {
      void getJson(`/v1/jobs/${encodeURIComponent(redraftId)}`).then((read) => {
        if (stopped || read.kind !== 'ok') return;
        const body = read.body as { status?: unknown; result_ref?: unknown };
        if (typeof body.status !== 'string' || !STATUSES.has(body.status)) return;
        setPolled({ status: body.status as JobStatus, result: resultOf(body.result_ref) });
      });
    };
    poll();
    const timer = setInterval(poll, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [live, redraftId, getJson, tick]);

  const versionIds =
    result === null
      ? null
      : [result.candidate_version_id ?? result.base_version_id, result.base_version_id];
  const versions = useLiveRows<{ id: string; coverage: string | null }>(VERSIONS_SQL, versionIds, [
    'itinerary_versions',
  ]);
  const locale = useActiveLocale();
  const baseDay = useLiveRows<DayTitleRow>(
    DAY_SQL,
    result === null ? null : [result.base_version_id, result.day_no],
    ['plan_days'],
  );
  const candidate =
    result === null || result.candidate_version_id === null
      ? null
      : [result.candidate_version_id, result.day_no];
  const newDay = useLiveRows<DayTitleRow>(DAY_SQL, candidate, ['plan_days']);
  const notes = useLiveRows<NoteRow>(NOTES_SQL, candidate, ['plan_items', 'plan_days']);
  const reasons = useMemo(() => {
    const read = new Map<string, string>();
    for (const row of notes.rows) {
      const text = guideText('plan_item', row, 'notes', locale);
      if (text !== null && text !== '' && text !== row.notes) read.set(row.stable_id, text);
    }
    return read;
  }, [notes.rows, locale]);
  const titleOf = (row: DayTitleRow | undefined): string | null =>
    row === undefined ? null : guideText('plan_day', row, 'theme', locale);
  const places = useMemo(() => {
    const merged: Record<string, DraftPlace> = {};
    for (const version of versions.rows) {
      const coverage = draftCoverageSchema.safeParse(parseJson<unknown>(version.coverage, null));
      if (coverage.success) Object.assign(merged, coverage.data.places);
    }
    return merged;
  }, [versions.rows]);

  return {
    loaded: job.loaded && reservation.loaded,
    status,
    result,
    places,
    baseTitle: titleOf(baseDay.rows[0]),
    newTitle: titleOf(newDay.rows[0]),
    reasons,
    settled:
      reservation.rows[0]?.status === 'reserved' ? null : (reservation.rows[0]?.status ?? null),
  };
}
