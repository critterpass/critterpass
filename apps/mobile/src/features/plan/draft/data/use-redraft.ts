/**
 * One redraft, live: its job (synced row, `redraft.result` on `trip_draft:{trip_id}`, and a
 * `GET /v1/jobs/{id}` poll while it runs), the server's diff once it is delivered, the names of
 * the places both versions name, the day's title before the redraft and whether the organiser has
 * already kept or put it back (its reservation settled).
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

import type { JobStatus } from './job';
import { parseJson, useLiveRows } from './rows';
import { useDraftServices } from './services';
import { POLL_MS } from './use-draft-job';

export interface RedraftView {
  readonly loaded: boolean;
  readonly status: JobStatus | null;
  readonly result: RedraftResult | null;
  readonly places: Readonly<Record<string, DraftPlace>>;
  /** The day's title in the draft the redraft was asked against. */
  readonly baseTitle: string | null;
  /** `committed` once kept or put back, `released` when it did not count. */
  readonly settled: string | null;
}

const JOB_SQL = 'SELECT id, status, result_ref FROM agent_jobs WHERE id = ?';
const RESERVATION_SQL = 'SELECT status FROM redraft_reservations WHERE agent_job_id = ?';
const VERSIONS_SQL = 'SELECT id, coverage FROM itinerary_versions WHERE id IN (?, ?)';
const BASE_DAY_SQL = 'SELECT theme FROM plan_days WHERE version_id = ? AND day_no = ?';

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
  const baseDay = useLiveRows<{ theme: string | null }>(
    BASE_DAY_SQL,
    result === null ? null : [result.base_version_id, result.day_no],
    ['plan_days'],
  );
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
    baseTitle: baseDay.rows[0]?.theme ?? null,
    settled:
      reservation.rows[0]?.status === 'reserved' ? null : (reservation.rows[0]?.status ?? null),
  };
}
