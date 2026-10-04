/**
 * What each FIX on the plan check would do, for the line under its card: the day's best order and
 * how much driving it saves, a rain or crowds block's own swap, the nearer place for a too-far
 * day. One ask per route and day, again when the plan's version changes; while it is out (or
 * offline) the line says it plainly without numbers.
 */
import type { PlanCheckIssue } from '@cp/domain';
import { useEffect, useMemo, useState } from 'react';

import type { FixPreview } from '../issue-copy';
import { call, fixerPaths, readReorder, readSwaps, readTooFar } from './fixer-api';

type Kind = 'reorder' | 'swaps' | 'tooFar';

interface Ask {
  readonly kind: Kind;
  readonly path: string;
}

function askOf(tripId: string, issue: PlanCheckIssue): Ask | null {
  if (issue.fix?.kind !== 'screen' || issue.day_id === null) return null;
  switch (issue.fix.screen) {
    case 'less_driving':
      return { kind: 'reorder', path: fixerPaths.reorder(tripId, issue.day_id) };
    case 'rain_crowds':
      return { kind: 'swaps', path: fixerPaths.swaps(tripId, issue.day_id) };
    case 'too_far':
      return { kind: 'tooFar', path: fixerPaths.tooFar(tripId, issue.day_id) };
    case 'fill_gap':
      return null;
  }
}

export function previewOf(
  issue: PlanCheckIssue,
  answer: unknown,
  kind: Kind,
  name: (stableId: string) => string,
  clock: (instant: string) => string,
): FixPreview {
  if (kind === 'reorder') {
    const reorder = readReorder(answer);
    if (!reorder.found) return {};
    const second = issue.kind === 'clash' ? issue.params.second : null;
    const slot = reorder.schedule.find((entry) => entry.stableId === second);
    return {
      savedMin: reorder.beforeMin - reorder.afterMin,
      estimated: !reorder.checked,
      movedTo:
        second === null || slot === undefined
          ? null
          : { stableId: second, time: clock(slot.startsAt) },
    };
  }
  if (kind === 'swaps') {
    const swaps = readSwaps(answer);
    const target = issue.stable_ids[0];
    const swap = swaps.swaps.find((entry) => entry.stableId === target);
    return swap === undefined
      ? {}
      : { swap: { to: swap.to, withName: swap.withId === null ? null : name(swap.withId) } };
  }
  const tooFar = readTooFar(answer);
  return tooFar.found
    ? {
        nearer: tooFar.name,
        nearerSavedMin: tooFar.driveBefore - tooFar.driveAfter,
        nearerLegMin: tooFar.legIn,
      }
    : { nearer: null };
}

export function useFixPreviews(
  tripId: string,
  versionId: string | null,
  issues: readonly PlanCheckIssue[],
  name: (stableId: string) => string,
  clock: (instant: string) => string,
): ReadonlyMap<string, FixPreview> {
  const asks = useMemo(() => {
    const byPath = new Map<string, Ask>();
    for (const issue of issues) {
      const ask = askOf(tripId, issue);
      if (ask !== null) byPath.set(ask.path, ask);
    }
    return [...byPath.values()];
  }, [issues, tripId]);
  const [answers, setAnswers] = useState<ReadonlyMap<string, unknown>>(new Map());
  const key = asks.map((ask) => ask.path).join('|');
  useEffect(() => {
    if (versionId === null || asks.length === 0) return undefined;
    let live = true;
    void Promise.all(asks.map(async (ask) => [ask.path, await call(ask.path)] as const)).then(
      (pairs) => {
        if (!live) return;
        setAnswers(new Map(pairs.filter(([, body]) => body !== null)));
      },
    );
    return () => {
      live = false;
    };
    // `key` stands for `asks`: the same routes need no new ask.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, versionId]);
  return useMemo(() => {
    const previews = new Map<string, FixPreview>();
    for (const issue of issues) {
      const ask = askOf(tripId, issue);
      const answer = ask === null ? undefined : answers.get(ask.path);
      if (ask === null || answer === undefined) continue;
      previews.set(issue.id, previewOf(issue, answer, ask.kind, name, clock));
    }
    return previews;
  }, [answers, clock, issues, name, tripId]);
}
