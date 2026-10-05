/**
 * The places people come for fill a trip first and stay from one draft to the next, and a day
 * redrafted for rain goes indoors or says that nothing indoors is near.
 */
import type { Itinerary } from '@cp/domain';
import { choicesOfDay, pinIdOf, type DraftPoi } from '@cp/planner';
import { describe, expect, it } from 'vitest';

import { baselineItinerary } from '../evals/draft/baseline';
import { CREWS, planInput } from '../evals/draft/cases';
import { buildDayRequest, scheduleChoices } from '../src/prompts/draft/day';
import { essentialsLeftOut, essentialsOf, placeEssentials } from '../src/prompts/draft/essentials';
import { withHeldStops } from '../src/prompts/draft/held';
import { plannerLines } from '../src/prompts/draft/final-notes';
import { coreMustSees } from '../src/prompts/draft/must-sees';
import { buildRedraftRequest } from '../src/prompts/draft/redraft';
import { redraftSkeletonDay } from '../src/prompts/draft/redraft-input';
import {
  indoorsInstead,
  isOutdoors,
  leftOutdoors,
  wantsIndoors,
} from '../src/prompts/draft/redraft-rain';
import {
  buildSkeletonRequest,
  normaliseSkeleton,
  type SkeletonDay,
} from '../src/prompts/draft/skeleton';
import { templateSummary } from '../src/prompts/draft/summary';

const crew = CREWS.find((c) => c.id === 'dalat-curated-1');
if (crew === undefined) throw new Error('no dalat-curated-1 crew');
// The crew reads Vietnamese; these tests read the planner's English lines.
const { locale: _locale, ...input } = planInput(crew);
const name = (id: string) => input.pois.get(id)?.name ?? id;

describe('the core must-sees of a trip', { timeout: 60_000 }, () => {
  const core = coreMustSees(input);

  it('are the long visits near the stay, the same every time', () => {
    expect(core).toHaveLength(20);
    expect(coreMustSees(planInput(crew))).toEqual(core);
    const names = core.map(name);
    for (const known of ['Langbiang', 'Hồ Xuân Hương', 'Thiền Viện Trúc Lâm', 'Datanla Falls']) {
      expect(names.some((n) => n.normalize('NFC').startsWith(known.normalize('NFC')))).toBe(true);
    }
    expect(core.every((id) => input.pois.get(id)?.mustSee === true)).toBe(true);
  });

  it('are placed by the planner when the guide’s outline leaves them out', () => {
    // An outline that names no place at all: every day still gets its must-sees.
    const outline = normaliseSkeleton(input, {
      stay_area: 'the centre',
      days: input.frame.dates.map((_, index) => ({
        day_no: index + 1,
        theme: 'A day',
        area: 'the centre',
        must_do_ids: [],
        poi_ids: [],
      })),
      wishes: [],
    });
    const planned = outline.days.flatMap((day) => day.poiIds);
    const kept = planned.filter((id) => core.includes(id));
    expect(kept.length).toBeGreaterThanOrEqual(8);
    // The first of them all have a day, and every day leads with its own.
    expect(core.slice(0, 5).every((id) => planned.includes(id))).toBe(true);
    for (const day of outline.days) {
      const firstOther = day.poiIds.findIndex((id) => !core.includes(id));
      const lastCore = day.poiIds.map((id) => core.includes(id)).lastIndexOf(true);
      expect(firstOther === -1 || lastCore < firstOther).toBe(true);
    }
  });
});

describe('a redraft for rain', { timeout: 60_000 }, () => {
  const base = baselineItinerary(input);
  const lake = [...input.pois.values()].find(
    (p) => p.category === 'nature' && p.mustSee,
  ) as DraftPoi;
  const plain = (note: string | null) => ({
    ...input,
    base,
    dayNo: 2,
    reasons: [] as const,
    note,
    chat: [],
  });

  it('is read from the organiser’s note, in her words', () => {
    expect(wantsIndoors(plain('trời hay mưa, cho mình chỗ trong nhà'))).toBe(true);
    expect(wantsIndoors(plain('It will rain all day, something indoors please'))).toBe(true);
    // "mua" without its accent is "to buy".
    expect(wantsIndoors(plain('mua qua cho me'))).toBe(false);
    expect(wantsIndoors(plain(null))).toBe(false);
    expect(isOutdoors(lake)).toBe(true);
  });

  it('tells the guide which stops are in the open air, and offers places under a roof first', () => {
    const wet = plain('trời mưa');
    const text = JSON.stringify(buildRedraftRequest(wet));
    expect(text).toContain('Rain means no stop in the open air');
    const offered = redraftSkeletonDay(wet).poiIds.map((id) => input.pois.get(id) as DraftPoi);
    const firstOutdoor = offered.findIndex(isOutdoors);
    const lastIndoor = offered.map((poi) => !isOutdoors(poi)).lastIndexOf(true);
    expect(firstOutdoor === -1 || lastIndoor < firstOutdoor).toBe(true);
    expect(JSON.stringify(buildRedraftRequest(plain(null)))).not.toContain('Rain means');
  });

  it('swaps a stop left outdoors for an indoor one, or says nothing indoors is near', () => {
    const wet = plain('trời mưa');
    const skeleton = redraftSkeletonDay(wet);
    const day = base.days[1] as Itinerary['days'][number];
    const choices = [
      ...choicesOfDay(day).filter((choice) => choice.kind === 'meal' || choice.mustDoId !== null),
      { poiId: lake.id, kind: 'activity' as const, mustDoId: null, note: null },
    ];
    const timed = scheduleChoices(wet, { ...skeleton, poiIds: [lake.id] }, choices, 'wet');
    const start: Itinerary = {
      ...base,
      days: base.days.map((d) => (d.day_no === 2 ? { ...timed, theme: day.theme } : d)),
    };
    expect(leftOutdoors(wet, start.days[1] as Itinerary['days'][number]).map((p) => p.id)).toEqual([
      lake.id,
    ]);
    const dry = indoorsInstead(wet, skeleton, start).days[1];
    expect(dry?.items.some((item) => item.poi_id === lake.id)).toBe(false);
    expect(leftOutdoors(wet, dry as Itinerary['days'][number])).toEqual([]);
    // With no indoor place on offer the stop stays and says so.
    const stuck = indoorsInstead(wet, { ...skeleton, poiIds: [] }, start).days[1];
    const note = stuck?.items.find((item) => item.poi_id === lake.id)?.note ?? '';
    expect(note).toContain(plannerLines(undefined).outdoors);
  });
});

describe('the essential handful', { timeout: 60_000 }, () => {
  const essentials = essentialsOf(input);
  const outline = (): readonly SkeletonDay[] =>
    normaliseSkeleton(input, {
      stay_area: 'the centre',
      days: input.frame.dates.map((_, index) => ({
        day_no: index + 1,
        theme: 'A day',
        area: 'the centre',
        must_do_ids: [],
        poi_ids: [],
      })),
      wishes: [],
    }).days;

  it('leads the core must-sees, every one of it', () => {
    expect(essentials.length).toBeGreaterThanOrEqual(12);
    const core = coreMustSees(input);
    const offered = essentials.filter((poi) => input.pools.activities.includes(poi));
    expect(core.slice(0, offered.length).sort()).toEqual(offered.map((poi) => poi.id).sort());
  });

  it('is placed by the planner alone when the guide names nothing', () => {
    const days = outline();
    const base = baselineItinerary(input);
    const planned: Itinerary = {
      ...base,
      days: days.map((day) =>
        scheduleChoices(
          input,
          day,
          day.poiIds.map((poiId) => ({
            poiId,
            kind: 'activity' as const,
            mustDoId: null,
            note: null,
          })),
          'outline',
        ),
      ),
    };
    const settled = placeEssentials(input, days, planned).itinerary;
    const gaps = essentialsLeftOut(input, settled);
    // Whatever is still out is out for a reason a rule gives, never for want of room.
    expect(gaps.filter((gap) => gap.reason === 'no_room').map((gap) => name(gap.poiId))).toEqual(
      [],
    );
  });

  it('says why an essential is not in a draft', () => {
    const empty: Itinerary = {
      currency: 'USD',
      days: input.frame.dates.map((date, index) => ({
        day_no: index + 1,
        date,
        theme: '',
        items: [],
      })),
    };
    const lake = essentials.find((poi) => input.pools.activities.includes(poi)) as DraftPoi;
    expect(essentialsLeftOut(input, empty).find((gap) => gap.poiId === lake.id)?.reason).toBe(
      'no_room',
    );
    const closed = { ...input, pools: { ...input.pools, openDays: new Map() } };
    expect(essentialsLeftOut(closed, empty).find((gap) => gap.poiId === lake.id)?.reason).toBe(
      'closed',
    );
    const taken = {
      ...input,
      pools: {
        ...input.pools,
        activities: input.pools.activities.filter((poi) => poi.id !== lake.id),
        sights: input.pools.sights.filter((poi) => poi.id !== lake.id),
      },
    };
    expect(essentialsLeftOut(taken, empty).find((gap) => gap.poiId === lake.id)?.reason).toBe(
      'not_offered',
    );
  });
});

describe('a first draft for a reader of another language', () => {
  it('asks for her language in the outline, each day and the summary’s fallback', () => {
    const vi = { ...input, locale: 'vi' };
    expect(JSON.stringify(buildSkeletonRequest(vi))).toContain(
      'summary and note in Vietnamese (vi)',
    );
    expect(JSON.stringify(buildSkeletonRequest(input))).not.toContain('summary and note in');
    // An outline whose themes are not usable (digits) falls back to her language too.
    const day = normaliseSkeleton(vi, {
      stay_area: 'x',
      days: vi.frame.dates.map((_, index) => ({
        day_no: index + 1,
        theme: 'Day 2 at 10:00',
        area: 'the centre',
        must_do_ids: [],
        poi_ids: [],
      })),
      wishes: [],
    }).days[1] as SkeletonDay;
    expect(day.theme).toBe('Một ngày trong phố');
    expect(JSON.stringify(buildDayRequest(vi, { day, usedElsewhere: new Set() }))).toContain(
      'summary and note in Vietnamese (vi)',
    );
    const line = templateSummary({
      guide: vi.guide,
      destination: 'Đà Lạt',
      themes: [],
      allMustDos: true,
      locale: 'vi',
    });
    expect(line).toContain('bản nháp');
  });
});

describe('a held stop on a dropped pin', () => {
  it('gets a place of its own for the draft, and rides to it are known', () => {
    const item = {
      ...(baselineItinerary(input).days[1]?.items[0] as Itinerary['days'][number]['items'][number]),
      stable_id: '0199f000-0000-7000-8000-000000000001',
      poi_id: null,
      locked_reason: 'user' as const,
      must_do_id: null,
    };
    const with_ = withHeldStops(input, [
      { dayNo: 2, item, pin: { name: 'Nhà bà ngoại', lat: 11.9465, lng: 108.4419 } },
    ]);
    const pin = with_.pois.get(pinIdOf(item.stable_id));
    expect(pin).toMatchObject({ name: 'Nhà bà ngoại', lat: 11.9465 });
    const lake = [...input.pois.values()].find((p) => p.mustSee) as DraftPoi;
    expect(with_.travel(pin?.id ?? '', lake.id)).toBeGreaterThan(0);
    expect(input.pois.has(pinIdOf(item.stable_id))).toBe(false);
    expect(with_.pools).toBe(input.pools);
  });
});
