/**
 * Up to three ways to fill a free window: the crew's own ideas that fit it first, then curated
 * places, then two places back to back, then going back to the stay (free). A place fits when it
 * is open for the whole visit, the travel from where the people are and on to the next item fits,
 * and rain is not likely over an outdoor visit.
 */
import { openSpans, openThrough, visitMinutes, type FitReason, type GapIdea } from '@cp/domain';

import { ceilGrid } from '../draft/day-minutes';
import { usualHours } from '../draft/open-data';
import { thresholdsOf, travelOf, type FitContext, type FitPlace, type FitStop } from './context';
import { clockOf } from './day-model';
import type { DayGap } from './gaps';
import { rainCheck } from './reasons';

export interface GapCandidate {
  readonly place: FitPlace & { readonly poiId: string };
  /** A crew idea (saved, swiped or imported) or a curated place nobody saved yet. */
  readonly source: 'idea' | 'curated';
  readonly costEachMinor: number | null;
  readonly currency: string | null;
  readonly saverId: string | null;
  /** Who said yes in a swipe or wants it. */
  readonly votedBy: readonly string[];
}

interface Visit {
  readonly candidate: GapCandidate;
  readonly start: number;
  readonly end: number;
  readonly travelIn: number;
  readonly reasons: FitReason[];
}

const MAX_IDEAS = 3;

const placeStop = (place: FitPlace & { readonly poiId: string }): FitStop => ({
  key: place.poiId,
  ...place.point,
});

function startStop(entry: DayGap): FitStop | null {
  if (entry.prev?.point) return { key: entry.prev.stableId, ...entry.prev.point };
  return entry.model.day.stay === null ? null : { key: 'stay', ...entry.model.day.stay };
}

/** One visit from `from` at or after `earliest`, ending in time to reach the next stop. */
function visit(
  context: FitContext,
  entry: DayGap,
  candidate: GapCandidate,
  from: FitStop | null,
  earliest: number,
  limit: number,
): Visit | null {
  const travel = travelOf(context);
  const { place } = candidate;
  const here = placeStop(place);
  const legIn = from === null ? null : travel(from, here);
  const start = ceilGrid(earliest + (legIn?.minutes ?? 0));
  const end =
    start + visitMinutes({ category: place.category, timeNeededMin: place.timeNeededMin ?? null });
  const span = openThrough(
    openSpans(place.hours ?? usualHours(place.category), entry.model.day.date),
    start,
    end,
  );
  if (span === null || end > limit) return null;
  const rain = rainCheck(
    entry.model.day.rain,
    place.outdoor,
    start,
    end,
    entry.fromMin,
    thresholdsOf(context),
  );
  if (rain.rainy) return null;
  const reasons: FitReason[] = [];
  if (legIn !== null) {
    reasons.push({
      code: legIn.mode === 'walk' ? 'walk_minutes' : 'drive_minutes',
      params: {
        minutes: legIn.minutes,
        from: from?.key === 'stay' ? 'stay' : from?.key === entry.prev?.stableId ? 'item' : 'poi',
        approx: legIn.approx,
        ...(from?.key === entry.prev?.stableId && entry.prev
          ? { stable_id: entry.prev.stableId }
          : {}),
      },
    });
  }
  if (span.end < 1440 && span.end - end <= 60) {
    reasons.push({ code: 'closes_at', params: { time: clockOf(span.end) } });
  }
  reasons.push(...rain.reasons);
  return { candidate, start, end, travelIn: legIn?.minutes ?? 0, reasons };
}

/** The latest a visit may end: in time to travel on to the next item, else the window's end. */
function endLimit(context: FitContext, entry: DayGap, candidate: GapCandidate): number {
  const next = entry.next;
  if (next === null || next.point === null) return entry.toMin;
  const leg = travelOf(context)(placeStop(candidate.place), { key: next.stableId, ...next.point });
  return next.start - (leg?.minutes ?? 0);
}

const toIdea = (kind: GapIdea['kind'], visits: readonly Visit[], minutes: number): GapIdea => {
  const lead = visits[0]?.candidate;
  return {
    kind,
    poi_ids: visits.map((entry) => entry.candidate.place.poiId),
    minutes,
    cost_each_minor:
      visits.length === 0 || visits.some((v) => v.candidate.costEachMinor === null)
        ? null
        : visits.reduce((sum, v) => sum + (v.candidate.costEachMinor ?? 0), 0),
    currency: lead?.currency ?? null,
    saver_id: lead?.saverId ?? null,
    voted_by: [...new Set(visits.flatMap((v) => v.candidate.votedBy))].sort(),
    reasons: visits.flatMap((v) => v.reasons).slice(0, 8),
  };
};

function singles(context: FitContext, entry: DayGap, pool: readonly GapCandidate[]): Visit[] {
  const from = startStop(entry);
  return pool.flatMap((candidate) => {
    const found = visit(
      context,
      entry,
      candidate,
      from,
      entry.fromMin,
      endLimit(context, entry, candidate),
    );
    return found === null ? [] : [found];
  });
}

function bestPair(
  context: FitContext,
  entry: DayGap,
  pool: readonly GapCandidate[],
): Visit[] | null {
  const from = startStop(entry);
  let best: { visits: Visit[]; ends: number } | null = null;
  for (const first of pool) {
    const a = visit(context, entry, first, from, entry.fromMin, entry.toMin);
    if (a === null) continue;
    for (const second of pool) {
      if (second === first) continue;
      const limit = endLimit(context, entry, second);
      const b = visit(context, entry, second, placeStop(first.place), a.end, limit);
      if (b !== null && (best === null || b.end < best.ends))
        best = { visits: [a, b], ends: b.end };
    }
  }
  return best?.visits ?? null;
}

export function gapIdeas(
  context: FitContext,
  entry: DayGap,
  pool: readonly GapCandidate[],
): GapIdea[] {
  const ideas = pool.filter((candidate) => candidate.source === 'idea');
  const curated = pool.filter((candidate) => candidate.source === 'curated');
  const byTravel = (a: Visit, b: Visit) => a.travelIn - b.travelIn || a.start - b.start;
  const options: GapIdea[] = [
    ...singles(context, entry, ideas)
      .sort((a, b) => b.candidate.votedBy.length - a.candidate.votedBy.length || byTravel(a, b))
      .map((v) => toIdea('single', [v], v.end - v.start)),
    ...singles(context, entry, curated)
      .sort(byTravel)
      .map((v) => toIdea('single', [v], v.end - v.start)),
  ];
  const pair = bestPair(context, entry, [...ideas, ...curated]);
  if (pair !== null) {
    options.push(toIdea('pair', pair, (pair[1]?.end ?? 0) - (pair[0]?.start ?? 0)));
  }
  const stay = entry.model.day.stay;
  const from = startStop(entry);
  if (stay !== null && from !== null && from.key !== 'stay') {
    const leg = travelOf(context)(from, { key: 'stay', ...stay });
    options.push({
      kind: 'stay',
      poi_ids: [],
      minutes: leg?.minutes ?? 0,
      cost_each_minor: 0,
      currency: null,
      saver_id: null,
      voted_by: [],
      reasons:
        leg === null
          ? []
          : [
              {
                code: leg.mode === 'walk' ? 'walk_minutes' : 'drive_minutes',
                params: {
                  minutes: leg.minutes,
                  from: 'item',
                  stable_id: from.key,
                  approx: leg.approx,
                },
              },
            ],
    });
  }
  return options.slice(0, MAX_IDEAS);
}
