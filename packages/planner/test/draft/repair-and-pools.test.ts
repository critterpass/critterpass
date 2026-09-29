import type { Itinerary } from '@cp/domain';
import { describe, expect, it } from 'vitest';

import {
  candidatePools,
  dropViolations,
  repairTargets,
  validateItinerary,
  type TripFrame,
} from '../../src/draft/index';
import { FRAME, P, POIS, REQUIRED, TRAVEL, itinerary, uuid } from './kyoto-fixture';

function check(plan: Itinerary, frame: TripFrame = FRAME) {
  return validateItinerary({
    itinerary: plan,
    pois: POIS,
    frame,
    travel: TRAVEL,
    requiredMustDoIds: REQUIRED,
  }).violations;
}

const without = (plan: Itinerary, poiId: string): Itinerary => ({
  ...plan,
  days: plan.days.map((day) => ({
    ...day,
    items: day.items.filter((item) => item.poi_id !== poiId),
  })),
});

const targetsFor = (plan: Itinerary, frame: TripFrame = FRAME) =>
  repairTargets({
    itinerary: plan,
    violations: check(plan, frame),
    pois: POIS,
    mustDoDays: new Map([[uuid(505), [1, 2]]]),
    mustDoPoi: new Map([[uuid(505), P.kiyomizu.id]]),
    crewSize: FRAME.members.length,
  });

describe('repairTargets', () => {
  it('redoes only the days that broke a rule, with the reason in words', () => {
    const plan = itinerary();
    const broken: Itinerary = {
      ...plan,
      days: plan.days.map((day) =>
        day.day_no === 1
          ? {
              ...day,
              items: day.items.map((item) =>
                item.poi_id === P.tofu.id ? { ...item, poi_id: P.yakitori.id } : item,
              ),
            }
          : day,
      ),
    };
    const targets = targetsFor(broken);
    expect(targets.map((t) => t.dayNo)).toEqual([1]);
    expect(targets[0]?.reasons[0]?.text).toContain('Torito');
    expect(targets[0]?.reasons[0]?.code).toBe('DIETARY');
  });

  it("sends a missing must-do to the lightest day it's open on", () => {
    const targets = targetsFor(without(itinerary(), P.kiyomizu.id));
    expect(targets.map((t) => t.dayNo)).toEqual([1]);
    expect(targets[0]?.reasons[0]).toMatchObject({
      code: 'MUST_DO_MISSING',
      mustDoId: uuid(505),
      poiId: P.kiyomizu.id,
    });
  });

  it('sends a budget overrun to the costliest days until they cover it', () => {
    const targets = targetsFor(itinerary(), { ...FRAME, budgetPpMinor: 12_000 });
    expect(targets.map((t) => t.dayNo)).toEqual([2]);
    expect(targets[0]?.reasons[0]?.code).toBe('OVER_BUDGET');
  });

  it('drops what still breaks an item rule and reports the must-dos it took', () => {
    const plan = itinerary();
    const closed: TripFrame = {
      ...FRAME,
      closures: [
        {
          poi_id: P.kiyomizu.id,
          area: 'Kiyomizu-dera',
          closed_from: '2026-11-01',
          closed_to: '2026-11-05',
          reason: 'Roof repairs',
          source_url: 'https://example.org/kiyomizu',
        },
      ],
    };
    const { itinerary: kept, dropped } = dropViolations(plan, check(plan, closed));
    expect(dropped).toEqual([{ stableId: expect.any(String) as string, mustDoId: uuid(505) }]);
    expect(kept.days[0]?.items.map((i) => i.poi_id)).not.toContain(P.kiyomizu.id);
  });
});

describe('candidatePools', () => {
  it('lists open must-dos with their days, leaves out closed places and unsuitable meals', () => {
    const frame: TripFrame = {
      ...FRAME,
      closures: [
        {
          poi_id: P.kinkakuji.id,
          area: 'Kinkaku-ji',
          closed_from: '2026-11-01',
          closed_to: '2026-11-05',
          reason: 'Closed for a ceremony',
          source_url: 'https://example.org/kinkakuji',
        },
      ],
    };
    const pools = candidatePools({
      pois: [...POIS.values()],
      frame,
      tastes: { museums: 2, markets: 1 },
    });
    expect(pools.unplaceable).toEqual([{ mustDoId: uuid(502), reason: 'closed' }]);
    expect(pools.mustDos.find((m) => m.mustDoId === uuid(503))?.openDays).toEqual([1, 2, 3]);
    expect(pools.activities.map((p) => p.id)).not.toContain(P.kinkakuji.id);
    expect(pools.activities.map((p) => p.id)).not.toContain(P.fushimi.id);
    expect(pools.meals.map((p) => p.id)).not.toContain(P.yakitori.id);
    expect(pools.activities[0]?.id).toBe(P.museum.id);
  });
});
