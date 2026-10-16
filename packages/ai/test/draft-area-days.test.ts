/**
 * A drafted day stays in one area of the destination, or two that neighbour each other, the way
 * itinerary pages lay a day out: what code adds to the guide's outline (must-sees it left out,
 * meal places, spares) comes from the day's own areas first and never carries the day across town
 * when its areas have a place for it.
 */
import { readFileSync } from 'node:fs';

import { mealSlots, type DraftPoi } from '@cp/planner';
import { describe, expect, it } from 'vitest';

import { CREWS, planInput } from '../evals/draft/cases';
import { areaStep, areasHeld } from '../src/prompts/draft/areas';
import { aliases, type DraftPlanInput } from '../src/prompts/draft/context';
import { normaliseSkeleton } from '../src/prompts/draft/skeleton';
import { anchorsOf, type OutlineDay } from '../src/prompts/draft/skeleton-days';
import { parseStructuredText, textOf } from '../src/structured';

function inputOf(caseId: string): DraftPlanInput {
  const crew = CREWS.find((c) => c.id === caseId);
  if (crew === undefined) throw new Error(`no ${caseId} crew`);
  return planInput(crew);
}

/** The outline the guide gave for a recorded case, as its recording holds it. */
function recordedOutline(caseId: string): unknown {
  const recorded = JSON.parse(
    readFileSync(new URL(`../evals/draft/fixtures/${caseId}.json`, import.meta.url), 'utf8'),
  ) as { calls: Record<string, { body: unknown }> };
  const body = recorded.calls['skeleton']?.body;
  if (body === undefined) throw new Error(`no outline in ${caseId}`);
  return parseStructuredText(textOf(body as never));
}

describe('how far a place takes a day from its areas', () => {
  const base = inputOf('dalat-curated-1');
  const [a, b, c, d, e] = base.pools.activities;
  if (a === undefined || b === undefined || c === undefined || d === undefined || e === undefined)
    throw new Error('too few activities');
  const area = new Map([
    [a.id, 'Old Town'],
    [b.id, 'Old Town'],
    [c.id, 'Lakeside'],
    [d.id, 'Market'],
    [e.id, 'Hills'],
  ]);
  // Every place five minutes apart, the hills half an hour from everything.
  const activities = base.pools.activities.map((poi) => ({
    ...poi,
    area: area.get(poi.id) ?? null,
  }));
  const pois = new Map(base.pois);
  for (const poi of activities) pois.set(poi.id, poi);
  const input: DraftPlanInput = {
    ...base,
    pois,
    pools: { ...base.pools, activities },
    travel: (from, to) => (from === to ? 0 : from === e.id || to === e.id ? 30 : 5),
  };

  it('is none inside the day’s area, one into a neighbouring second area', () => {
    expect(areaStep(input, b.id, [a.id])).toBe(0);
    expect(areaStep(input, c.id, [a.id])).toBe(1);
  });

  it('is too far into a third area, or into a second one across town', () => {
    expect(areaStep(input, d.id, [a.id, c.id])).toBe(2);
    expect(areaStep(input, e.id, [a.id])).toBe(2);
  });
});

describe.each(['dalat-curated-1', 'danang-1', 'bali-1', 'cusco-1'])(
  'the outline code finishes for %s',
  (caseId) => {
    const input = inputOf(caseId);
    const raw = recordedOutline(caseId) as { days?: { poi_ids?: string[] }[] };
    const outline = normaliseSkeleton(input, raw);
    const days = outline.days as unknown as OutlineDay[];
    const asked = new Set(
      (raw.days ?? []).flatMap((day) => (day.poi_ids ?? []).map(aliases(input).resolvePlace)),
    );

    it('adds a must-see the guide left out to its areas; only an essential goes farther', () => {
      for (const day of days) {
        const anchors = anchorsOf(input, day);
        const added = day.poiIds.filter((poiId) => !asked.has(poiId));
        for (const id of added) {
          const others = anchors.filter((other) => other !== id);
          if (areaStep(input, id, others) < 2) continue;
          expect(input.pois.get(id)?.essential).toBe(true);
          expect(areasHeld(input, others).size).toBe(1);
        }
        // The guide's own picks keep their seats ahead of what code added.
        const firstAdded = day.poiIds.findIndex((poiId) => !asked.has(poiId));
        if (firstAdded !== -1) {
          expect(day.poiIds.slice(firstAdded).every((poiId) => !asked.has(poiId))).toBe(true);
        }
      }
    });

    it('sets spares aside only in a day’s areas or the one beside them', () => {
      for (const day of days) {
        const anchors = anchorsOf(input, day);
        for (const id of day.spareIds) expect(areaStep(input, id, anchors)).toBeLessThan(2);
      }
    });

    it('lists a meal place across town only when the day’s areas have none left for it', () => {
      const listed = new Set(days.flatMap((day) => day.mealIds));
      const mustDoPlaces = new Set(input.pools.mustDos.map((slot) => slot.poiId));
      for (const day of days) {
        const anchors = anchorsOf(input, day);
        const near = (slot: string) =>
          input.pools.eateries.filter(
            (poi: DraftPoi) =>
              !listed.has(poi.id) &&
              !mustDoPlaces.has(poi.id) &&
              (input.pools.openDays.get(poi.id) ?? []).includes(day.dayNo) &&
              (mealSlots(poi, day.date) as readonly string[]).includes(slot) &&
              areaStep(input, poi.id, anchors) < 2,
          );
        for (const id of day.mealIds) {
          const poi = input.pois.get(id);
          if (poi === undefined || areaStep(input, id, anchors) < 2) continue;
          const slots = mealSlots(poi, day.date);
          expect(slots.every((slot) => near(slot).length === 0)).toBe(true);
        }
      }
    });
  },
);
