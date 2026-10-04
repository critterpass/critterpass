/**
 * The fixer routes (docs/api-contracts-planning.md): Less driving, Rain and crowds and the too-far
 * swap for one day, the free-time ideas, and FIX ALL. Answers are private, never stored, and asked
 * again when the plan's version changes; a failed ask keeps the last good answer on screen.
 */
/* eslint-disable lingui/no-unlocalized-strings -- route paths and header values, never copy. */
import {
  changeSetOpsSchema,
  gapIdeasResultSchema,
  type ChangeSetOp,
  type GapIdeasResult,
} from '@cp/domain';
import { useEffect, useState } from 'react';

import { sessionHeaders } from '@/data/app-session/device-session';
import { resolveApiBaseUrl } from '@/data/places/apiBaseUrl';

const TIMEOUT_MS = 10_000;

export interface ReorderAnswer {
  readonly found: boolean;
  readonly beforeOrder: readonly string[];
  readonly beforeMin: number;
  readonly afterOrder: readonly string[];
  readonly afterMin: number;
  readonly schedule: readonly { readonly stableId: string; readonly startsAt: string }[];
  readonly locked: readonly string[];
  readonly was: readonly {
    readonly stableId: string;
    readonly position: number;
    readonly startsAt: string;
  }[];
  readonly ops: readonly ChangeSetOp[];
}

export type BlockProblem = 'rain' | 'crowds';

export interface SwapBlock {
  readonly stableId: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly outdoor: boolean;
  readonly problem: BlockProblem | null;
}

export interface SwapRow {
  readonly stableId: string;
  readonly from: string;
  readonly to: string;
  readonly reason: string;
  readonly withId: string | null;
}

export interface SwapsAnswer {
  readonly rain: {
    readonly from: string;
    readonly to: string;
    readonly source: 'forecast' | 'normals';
    readonly recheckOn: string | null;
  } | null;
  readonly crowds: {
    readonly source: 'visits' | 'editorial';
    readonly hourly: readonly number[];
  } | null;
  readonly busyFrom: string | null;
  readonly now: readonly SwapBlock[];
  readonly swapped: readonly SwapBlock[];
  readonly swaps: readonly SwapRow[];
  readonly ops: readonly ChangeSetOp[];
  readonly weather: { readonly changeSetId: string; readonly ops: readonly ChangeSetOp[] } | null;
}

export interface TooFarAnswer {
  readonly found: boolean;
  readonly stableId: string | null;
  readonly poiId: string | null;
  readonly name: string | null;
  readonly driveBefore: number;
  readonly driveAfter: number;
  readonly legIn: number | null;
}

type Json = Record<string, unknown>;
const obj = (value: unknown): Json =>
  typeof value === 'object' && value !== null ? (value as Json) : {};
const str = (value: unknown): string => (typeof value === 'string' ? value : '');
const num = (value: unknown): number => (typeof value === 'number' ? value : 0);
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const ops = (value: unknown): ChangeSetOp[] => {
  const parsed = changeSetOpsSchema.safeParse(value);
  return parsed.success ? parsed.data : [];
};

export function readReorder(body: unknown): ReorderAnswer {
  const root = obj(body);
  const before = obj(root['before']);
  const after = obj(root['after']);
  return {
    found: root['found'] === true,
    beforeOrder: list(before['order']).map(str),
    beforeMin: num(before['drive_min']),
    afterOrder: list(after['order']).map(str),
    afterMin: num(after['drive_min']),
    schedule: list(after['schedule']).map((entry) => ({
      stableId: str(obj(entry)['stable_id']),
      startsAt: str(obj(entry)['starts_at']),
    })),
    locked: list(root['locked']).map(str),
    was: list(root['was']).map((entry) => ({
      stableId: str(obj(entry)['stable_id']),
      position: num(obj(entry)['position']),
      startsAt: str(obj(entry)['starts_at']),
    })),
    ops: ops(root['ops']),
  };
}

const block = (entry: unknown): SwapBlock => {
  const row = obj(entry);
  const problem = row['problem'];
  return {
    stableId: str(row['stable_id']),
    startsAt: str(row['starts_at']),
    endsAt: str(row['ends_at']),
    outdoor: row['outdoor'] === true,
    problem: problem === 'rain' || problem === 'crowds' ? problem : null,
  };
};

export function readSwaps(body: unknown): SwapsAnswer {
  const root = obj(body);
  const rain = root['rain'] === null ? null : obj(root['rain']);
  const crowds = root['crowds'] === null ? null : obj(root['crowds']);
  const weather =
    root['weather'] === null || root['weather'] === undefined ? null : obj(root['weather']);
  return {
    rain:
      rain === null
        ? null
        : {
            from: str(rain['from']),
            to: str(rain['to']),
            source: rain['source'] === 'forecast' ? 'forecast' : 'normals',
            recheckOn: typeof rain['recheck_on'] === 'string' ? rain['recheck_on'] : null,
          },
    crowds:
      crowds === null
        ? null
        : {
            source: crowds['source'] === 'visits' ? 'visits' : 'editorial',
            hourly: list(crowds['hourly']).map(num),
          },
    busyFrom: typeof root['busy_from'] === 'string' ? root['busy_from'] : null,
    now: list(root['now']).map(block),
    swapped: list(root['swapped']).map(block),
    swaps: list(root['swaps']).map((entry) => {
      const row = obj(entry);
      return {
        stableId: str(row['stable_id']),
        from: str(row['from']),
        to: str(row['to']),
        reason: str(row['reason_code']),
        withId: typeof row['with_id'] === 'string' ? row['with_id'] : null,
      };
    }),
    ops: ops(root['ops']),
    weather:
      weather === null
        ? null
        : { changeSetId: str(weather['change_set_id']), ops: ops(weather['ops']) },
  };
}

export function readTooFar(body: unknown): TooFarAnswer {
  const root = obj(body);
  return {
    found: root['found'] === true,
    stableId: typeof root['stable_id'] === 'string' ? root['stable_id'] : null,
    poiId: typeof root['poi_id'] === 'string' ? root['poi_id'] : null,
    name: typeof root['name'] === 'string' ? root['name'] : null,
    driveBefore: num(root['drive_before_min']),
    driveAfter: num(root['drive_after_min']),
    legIn: typeof root['leg_in_min'] === 'number' ? root['leg_in_min'] : null,
  };
}

export function readGapIdeas(body: unknown): GapIdeasResult | null {
  const parsed = gapIdeasResultSchema.safeParse(body);
  return parsed.success ? parsed.data : null;
}

/** One fixer route's JSON, or null when it could not be read (offline, an error). */
export async function call(path: string, init: RequestInit = {}): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${resolveApiBaseUrl()}${path}`, {
      ...init,
      headers: { ...(await sessionHeaders()), 'content-type': 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    return (await response.json()) as unknown;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export type ReadStatus = 'loading' | 'ready' | 'failed';

export interface FixerRead<T> {
  readonly status: ReadStatus;
  readonly data: T | null;
}

/** One fixer route's answer, asked again whenever the path or the plan's version changes. */
export function useFixerRead<T>(
  path: string | null,
  version: string | null,
  parse: (body: unknown) => T | null,
): FixerRead<T> {
  const key = path === null ? null : `${path}|${version ?? ''}`;
  const [state, setState] = useState<{
    readonly key: string | null;
    readonly status: ReadStatus;
    readonly data: T | null;
  }>({ key: null, status: 'loading', data: null });
  useEffect(() => {
    if (path === null || key === null) return undefined;
    let live = true;
    void call(path).then((body) => {
      if (!live) return;
      const data = body === null ? null : parse(body);
      setState((current) =>
        data === null
          ? { key, status: 'failed', data: current.data }
          : { key, status: 'ready', data },
      );
    });
    return () => {
      live = false;
    };
  }, [key, parse, path]);
  return { status: state.key === key ? state.status : 'loading', data: state.data };
}

export const fixerPaths = {
  reorder: (tripId: string, dayId: string) =>
    `/v1/trips/${encodeURIComponent(tripId)}/days/${encodeURIComponent(dayId)}/reorder`,
  swaps: (tripId: string, dayId: string) =>
    `/v1/trips/${encodeURIComponent(tripId)}/days/${encodeURIComponent(dayId)}/swaps`,
  tooFar: (tripId: string, dayId: string) =>
    `/v1/trips/${encodeURIComponent(tripId)}/days/${encodeURIComponent(dayId)}/too-far`,
  gapIdeas: (tripId: string, gap: { dayId: string; start: string; end: string }) =>
    `/v1/trips/${encodeURIComponent(tripId)}/gaps/ideas?day_id=${encodeURIComponent(gap.dayId)}&start=${encodeURIComponent(gap.start)}&end=${encodeURIComponent(gap.end)}`,
};

/** FIX ALL: one draft of every chosen fix, the caller's alone; null when it could not be made. */
export async function fixAll(tripId: string, issueIds: readonly string[]): Promise<string | null> {
  const body = await call(`/v1/trips/${encodeURIComponent(tripId)}/check/fix-all`, {
    method: 'POST',
    body: JSON.stringify({ issue_ids: issueIds }),
  });
  const id = obj(body)['change_set_id'];
  return typeof id === 'string' ? id : null;
}
