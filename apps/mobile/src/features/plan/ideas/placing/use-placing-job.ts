/**
 * The placement job, live (7h-6): its synced row, the `job.progress` hints on my user channel, and
 * while it runs a `GET /v1/jobs/{id}` every few seconds in case sync or realtime are behind. All
 * three feed one reducer, so the lines tick in order whatever arrives first.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, paths and wire values, never copy. */
import { JOB_PROGRESS_TYPE } from '@cp/domain';
import { useEffect, useReducer } from 'react';

import { sessionHeaders } from '@/data/app-session/device-session';
import { useLiveRows } from '@/data/plan/live-rows';
import { resolveApiBaseUrl } from '@/data/places/apiBaseUrl';
import { OWNER_UID_KEY } from '@/data/powersync/local-tables';
import { useChannel } from '@/data/realtime/use-channel';

import { INITIAL_PLACING, isFinished, reducePlacing, type PlacingState } from './progress';

export const PLACING_POLL_MS = 4000;

const JOB_SQL = `SELECT status, steps, partial, result_ref FROM agent_jobs WHERE id = ?`;
const UID_SQL = 'SELECT value FROM local_state WHERE id = ?';

interface JobRow {
  readonly status: string;
  readonly steps: string | null;
  readonly partial: string | null;
  readonly result_ref: string | null;
}

function json(raw: string | null): unknown {
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

export function usePlacingJob(jobId: string): PlacingState {
  const [state, dispatch] = useReducer(reducePlacing, INITIAL_PLACING);
  const rows = useLiveRows<JobRow>(JOB_SQL, [jobId], ['agent_jobs']);
  const uid = useLiveRows<{ value: string }>(UID_SQL, [OWNER_UID_KEY], ['local_state']).rows[0]
    ?.value;
  const row = rows.rows[0];

  useEffect(() => {
    if (row === undefined) return;
    dispatch({
      kind: 'snapshot',
      status: row.status,
      steps: json(row.steps),
      partial: json(row.partial),
      resultRef: json(row.result_ref),
    });
  }, [row]);

  useChannel('user', uid ?? null, {
    onEvent: (envelope) => {
      if (envelope.type !== JOB_PROGRESS_TYPE) return;
      const data = envelope.data as { job_id?: unknown; step?: unknown; pct?: unknown } | null;
      if (data?.job_id !== jobId || typeof data.step !== 'string') return;
      dispatch({ kind: 'hint', step: data.step, pct: typeof data.pct === 'number' ? data.pct : 0 });
    },
  });

  const finished = isFinished(state);
  useEffect(() => {
    if (finished) return undefined;
    let stopped = false;
    const poll = async () => {
      try {
        const response = await fetch(
          `${resolveApiBaseUrl()}/v1/jobs/${encodeURIComponent(jobId)}`,
          { headers: await sessionHeaders() },
        );
        if (stopped || !response.ok) return;
        const body = (await response.json()) as Record<string, unknown>;
        dispatch({
          kind: 'snapshot',
          status: typeof body['status'] === 'string' ? body['status'] : '',
          steps: body['steps'],
          partial: body['partial'],
          resultRef: body['result_ref'],
        });
      } catch {
        // Offline: the synced row and the hints carry on.
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), PLACING_POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [finished, jobId]);

  return state;
}
