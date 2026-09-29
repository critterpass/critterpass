/**
 * The trip's drafting job, live: the newest synced `draft` job row, the hints on
 * `trip_draft:{trip_id}` and, while the job can still change, a `GET /v1/jobs/{id}` poll every few
 * seconds in case realtime or sync are behind. A second organiser device finds the same job from
 * its synced row or its first hint. `jobId` pins the job a start command just created.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, paths and wire values, never copy. */
import { useEffect, useMemo, useReducer } from 'react';

import { useChannel } from '@/data/realtime/use-channel';

import {
  applyHint,
  emptySnapshot,
  isLive,
  mergeSnapshots,
  snapshotFromSource,
  type JobSnapshot,
  type JobSource,
} from './job';
import { useLiveRows } from './rows';
import { useDraftServices } from './services';

export const POLL_MS = 4000;

const JOB_SQL = `SELECT id, status, steps, partial, result_ref, created_at FROM agent_jobs
  WHERE trip_id = ? AND kind = 'draft' ORDER BY created_at DESC LIMIT 1`;
const JOB_TABLES = ['agent_jobs'];

type Action =
  | { readonly kind: 'hint'; readonly type: string; readonly data: unknown }
  | { readonly kind: 'polled'; readonly job: JobSnapshot };

interface State {
  readonly hinted: JobSnapshot | null;
  readonly polled: JobSnapshot | null;
}

function jobIdOf(data: unknown): string | null {
  const id = (data as { job_id?: unknown } | null)?.job_id;
  return typeof id === 'string' ? id : null;
}

function reduce(state: State, action: Action): State {
  if (action.kind === 'polled') return { ...state, polled: action.job };
  const id = jobIdOf(action.data);
  if (id === null) return state;
  const base = state.hinted?.id === id ? state.hinted : emptySnapshot(id);
  return { ...state, hinted: applyHint(base, action.type, action.data) };
}

function pick(...candidates: (JobSnapshot | null)[]): JobSnapshot | null {
  return candidates.reduce<JobSnapshot | null>((acc, next) => {
    if (next === null) return acc;
    if (acc === null) return next;
    return next.id === acc.id ? mergeSnapshots(acc, next) : acc;
  }, null);
}

export interface DraftJobView {
  readonly job: JobSnapshot | null;
  /** The synced job rows have been read at least once. */
  readonly loaded: boolean;
}

export function useDraftJob(tripId: string, jobId: string | null): DraftJobView {
  const { getJson } = useDraftServices();
  const [state, dispatch] = useReducer(reduce, { hinted: null, polled: null });
  const local = useLiveRows<JobSource>(JOB_SQL, [tripId], JOB_TABLES);
  const row = local.rows[0];
  const synced = useMemo(() => (row === undefined ? null : snapshotFromSource(row)), [row]);
  const focus = jobId ?? synced?.id ?? state.hinted?.id ?? null;
  const job = useMemo(() => {
    const own = (snapshot: JobSnapshot | null) => (snapshot?.id === focus ? snapshot : null);
    return focus === null
      ? null
      : (pick(own(synced), own(state.polled), own(state.hinted)) ?? emptySnapshot(focus));
  }, [focus, synced, state.polled, state.hinted]);

  const [pollTick, poke] = useReducer((n: number) => n + 1, 0);
  useChannel('trip_draft', tripId, {
    onEvent: (envelope) => dispatch({ kind: 'hint', type: envelope.type, data: envelope.data }),
    onChannelReset: poke,
    onSubscribed: poke,
  });

  const live = isLive(job);
  useEffect(() => {
    if (focus === null || !live) return undefined;
    let stopped = false;
    const poll = () => {
      void getJson(`/v1/jobs/${encodeURIComponent(focus)}`).then((read) => {
        if (stopped || read.kind !== 'ok') return;
        const body = read.body as Partial<JobSource> & { job_id?: unknown };
        if (typeof body.job_id !== 'string') return;
        dispatch({
          kind: 'polled',
          job: snapshotFromSource({ ...(body as JobSource), id: body.job_id }),
        });
      });
    };
    poll();
    const timer = setInterval(poll, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [focus, live, getJson, pollTick]);

  return { job, loaded: local.loaded };
}
