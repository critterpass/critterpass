/**
 * Whether the stops an add would push stay open for their whole visit (`POST
 * /v1/trips/{id}/plan/opening-check`, which has every place's own hours): the sheet says which one
 * would start past its closing time, so a push never sends a stop there silently. It warns, it
 * does not stop the add: most stops have no known hours, and those are never judged. Offline,
 * nothing is said.
 */
/* eslint-disable lingui/no-unlocalized-strings -- route paths and wire values, never copy. */
import type { PlanOp, PlanState } from '@cp/domain';
import { t } from '@lingui/core/macro';
import { useEffect, useState } from 'react';

import { sessionHeaders } from '@/data/app-session/device-session';
import { resolveApiBaseUrl } from '@/data/places/apiBaseUrl';
import { minutesOnDay } from '@/data/plan/plan-model';

import { clock } from '../day/format';

export interface CheckedStop {
  readonly key: string;
  readonly title: string;
  readonly poiId: string;
  readonly startsAt: string;
  readonly endsAt: string;
}

const TIMEOUT_MS = 8000;

/** The stops `ops` move to a new time on `date`, with their place, for the check. */
export function movedStops(
  ops: readonly PlanOp[],
  state: PlanState,
  titleOf: (stableId: string) => string | null,
): CheckedStop[] {
  const byId = new Map(state.items.map((item) => [item.stable_id, item]));
  return ops.flatMap((op) => {
    if (op.op !== 'move' || op.new.starts_at === undefined || op.new.ends_at === undefined) {
      return [];
    }
    const poiId = byId.get(op.item)?.poi_id ?? null;
    if (poiId === null) return [];
    return [
      {
        key: op.item,
        title: titleOf(op.item) ?? '',
        poiId,
        startsAt: op.new.starts_at,
        endsAt: op.new.ends_at,
      },
    ];
  });
}

/** "Sacred Monkey Forest closes at 18:00; it would start at 20:25." */
export function closedLine(
  stop: CheckedStop,
  closes: string | null,
  locale: string,
  tz: string,
  date: string,
): string {
  const name = stop.title;
  const at = clock(locale, minutesOnDay(stop.startsAt, tz, date));
  if (closes === null) {
    return t({
      id: 'plan.add.closed.shut',
      message: `${name} is shut that day; it would start at ${at}.`,
    });
  }
  const shuts = clock(locale, Number(closes.slice(0, 2)) * 60 + Number(closes.slice(3)));
  return t({
    id: 'plan.add.closed.late',
    message: `${name} closes at ${shuts}; it would start at ${at}.`,
  });
}

/** The first stop that would not be open, with its closing time; null when all are, or offline. */
export function useOpeningCheck(
  tripId: string,
  stops: readonly CheckedStop[],
): { readonly stop: CheckedStop; readonly closes: string | null } | null {
  const key = stops.map((stop) => `${stop.key}@${stop.startsAt}`).join('|');
  const [answer, setAnswer] = useState<{
    key: string;
    closed: { key: string; closes: string | null }[];
  }>({ key: '', closed: [] });
  useEffect(() => {
    if (stops.length === 0) return undefined;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    void (async () => {
      try {
        const response = await fetch(
          `${resolveApiBaseUrl()}/v1/trips/${encodeURIComponent(tripId)}/plan/opening-check`,
          {
            method: 'POST',
            headers: { ...(await sessionHeaders()), 'content-type': 'application/json' },
            body: JSON.stringify({
              stops: stops.map((stop) => ({
                key: stop.key,
                poi_id: stop.poiId,
                starts_at: stop.startsAt,
                ends_at: stop.endsAt,
              })),
            }),
            signal: controller.signal,
          },
        );
        if (!response.ok) return;
        const body = (await response.json()) as {
          closed?: { key: string; closes: string | null }[];
        };
        setAnswer({ key, closed: body.closed ?? [] });
      } catch {
        // Offline: nothing is said.
      } finally {
        clearTimeout(timer);
      }
    })();
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
    // `key` folds in the stops and their times.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId, key]);
  if (answer.key !== key) return null;
  const first = answer.closed[0];
  const stop = stops.find((entry) => entry.key === first?.key);
  return first === undefined || stop === undefined ? null : { stop, closes: first.closes };
}
