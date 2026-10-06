/**
 * The ways from the reader's home city to a trip's destination, for the plan. The home is her own
 * home airport; the estimate is written on demand, so a pair nobody has asked for yet is asked
 * again every few seconds until it lands, and after a minute and a half the wait is reported as
 * `slow` instead of spinning for ever.
 */
/* eslint-disable lingui/no-unlocalized-strings -- a local query and state names, never copy. */
import { useCallback, useEffect, useState } from 'react';

import { useLiveRows } from '@/data/plan/live-rows';
import { lastGoodCache, useTravelDataReader } from '@/data/travel-data/client';

import { gettingTherePath, readGettingThere, type GettingThereRead } from './getting-there';

export type GettingThereState =
  | Exclude<GettingThereRead, { status: 'pending' }>
  | { readonly status: 'loading' }
  /** Still being written after every retry. */
  | { readonly status: 'slow' }
  /** The reader has no home airport, so there is no city to start from. */
  | { readonly status: 'no_home' };

const HOME_SQL = 'SELECT home_airport FROM users WHERE id = ?';
const HOME_TABLES = ['users'];
const POLL_MS = 5_000;
const POLLS = 18;
const LOADING: GettingThereState = { status: 'loading' };

export function useGettingThere(
  destinationId: string | null,
  uid: string | null,
): { readonly state: GettingThereState | null; readonly retry: () => void } {
  const reader = useTravelDataReader();
  const home = useLiveRows<{ home_airport: string | null }>(
    HOME_SQL,
    uid === null ? null : [uid],
    HOME_TABLES,
  );
  const from = home.rows[0]?.home_airport?.trim().toUpperCase() ?? '';
  const path = gettingTherePath(destinationId, from);
  const [answer, setAnswer] = useState<{ path: string; state: GettingThereState } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (path === null) return undefined;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const read = (left: number) => {
      void readGettingThere({
        reader,
        cache: lastGoodCache(),
        path,
        signal: controller.signal,
      }).then((result) => {
        if (controller.signal.aborted) return;
        if (result.status !== 'pending') setAnswer({ path, state: result });
        else if (left === 0) setAnswer({ path, state: { status: 'slow' } });
        else timer = setTimeout(() => read(left - 1), POLL_MS);
      });
    };
    read(POLLS);
    return () => {
      controller.abort();
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [path, reader, attempt]);
  const retry = useCallback(() => {
    setAnswer(null);
    setAttempt((n) => n + 1);
  }, []);
  // A trip with no destination yet has nowhere to get to: nothing is shown.
  if (destinationId === null || destinationId === '' || uid === null) return { state: null, retry };
  if (!home.loaded) return { state: LOADING, retry };
  if (path === null) return { state: { status: 'no_home' }, retry };
  return { state: answer?.path === path ? answer.state : LOADING, retry };
}
