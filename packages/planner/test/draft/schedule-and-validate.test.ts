import type { DraftItem, Itinerary } from '@cp/domain';
import { describe, expect, it } from 'vitest';

import {
  instantAt,
  validateItinerary,
  type DraftViolationCode,
  type TripFrame,
} from '../../src/draft/index';
import { FRAME, P, POIS, REQUIRED, TRAVEL, itemFor, itinerary, uuid } from './kyoto-fixture';

const local = (item: DraftItem) =>
  new Date(item.starts_at).toLocaleTimeString('en-GB', {
    timeZone: 'Asia/Tokyo',
    hour: '2-digit',
    minute: '2-digit',
  });

function validate(plan: Itinerary, frame: TripFrame = FRAME) {
  return validateItinerary({
    itinerary: plan,
    pois: POIS,
    frame,
    travel: TRAVEL,
    requiredMustDoIds: REQUIRED,
  });
}

function codes(plan: Itinerary, frame?: TripFrame): DraftViolationCode[] {
  return validate(plan, frame).violations.map((v) => v.code);
}

function retime(plan: Itinerary, poiId: string, date: string, from: number, to: number): Itinerary {
  const at = (m: number) => instantAt(date, m, 'Asia/Tokyo').toISOString();
  return {
    ...plan,
    days: plan.days.map((day) => ({
      ...day,
      items: day.items.map((item) =>
        item.poi_id === poiId ? { ...item, starts_at: at(from), ends_at: at(to) } : item,
      ),
    })),
  };
}

describe('scheduleDay', () => {
  it('starts after landing, adds travel, waits for opening and puts meals in their window', () => {
    const plan = itinerary();
    expect(local(itemFor(plan, P.kiyomizu.id))).toBe('11:30');
    expect(local(itemFor(plan, P.tofu.id))).toBe('13:30');
    expect(local(itemFor(plan, P.nishiki.id))).toBe('11:00');
    expect(local(itemFor(plan, P.shojin.id))).toBe('18:00');
    expect(itemFor(plan, P.philosopher.id).travel_min).toBe(60);
    expect(itemFor(plan, P.kinkakuji.id).amount_minor).toBe(2000);
    expect(itemFor(plan, P.fushimi.id).amount_minor).toBe(0);
  });
});

describe('validateItinerary', () => {
  it('passes a clean draft', () => {
    const result = validate(itinerary());
    expect(result.violations).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('catches each rule a draft can break', () => {
    const plan = itinerary();
    const day2 = FRAME.dates[1] as string;
    const swapPoi = (from: string, to: string): Itinerary => ({
      ...plan,
      days: plan.days.map((day) => ({
        ...day,
        items: day.items.map((item) => (item.poi_id === from ? { ...item, poi_id: to } : item)),
      })),
    });
    const cases: [DraftViolationCode, Itinerary, TripFrame?][] = [
      ['UNKNOWN_POI', swapPoi(P.gion.id, uuid(777))],
      ['CLOSED_AT_TIME', retime(plan, P.kinkakuji.id, day2, 16 * 60 + 30, 18 * 60)],
      [
        'CLOSED_ON_DATE',
        plan,
        {
          ...FRAME,
          closures: [
            {
              poi_id: P.gion.id,
              area: 'Gion',
              closed_from: '2026-11-02',
              closed_to: '2026-11-02',
              reason: 'Festival set-up',
              source_url: 'https://example.org/gion',
            },
          ],
        },
      ],
      ['OVERLAP', retime(plan, P.ramen.id, day2, 11 * 60, 12 * 60)],
      ['TRAVEL_TOO_LONG', retime(plan, P.ramen.id, day2, 12 * 60 + 30, 13 * 60 + 45)],
      ['OFF_GRID', retime(plan, P.ramen.id, day2, 12 * 60 + 50, 14 * 60)],
      ['DAY_OVERRUN', retime(plan, P.shojin.id, day2, 21 * 60 + 30, 22 * 60 + 45)],
      ['FLIGHT_BUFFER', retime(plan, P.philosopher.id, '2026-11-04', 17 * 60, 18 * 60)],
      ['DIETARY', swapPoi(P.tofu.id, P.yakitori.id)],
      ['DUPLICATE_PLACE', swapPoi(P.gion.id, P.fushimi.id)],
      [
        'MUST_DO_MISSING',
        {
          ...plan,
          days: plan.days.map((day) => ({
            ...day,
            items: day.items.filter((item) => item.poi_id !== P.kiyomizu.id),
          })),
        },
      ],
      ['OVER_BUDGET', plan, { ...FRAME, budgetPpMinor: 10_000 }],
    ];
    for (const [code, broken, frame] of cases) {
      expect(codes(broken, frame), code).toContain(code);
      expect(validate(broken, frame).ok, code).toBe(false);
    }
  });

  it('flags a must-do only when its place can be scheduled at all', () => {
    const plan = itinerary();
    const withoutFushimi = {
      ...plan,
      days: plan.days.map((day) => ({
        ...day,
        items: day.items.filter((i) => i.poi_id !== P.fushimi.id),
      })),
    };
    const result = validateItinerary({
      itinerary: withoutFushimi,
      pois: POIS,
      frame: FRAME,
      travel: TRAVEL,
      requiredMustDoIds: REQUIRED.filter((id) => id !== uuid(501)),
    });
    expect(result.violations.map((v) => v.code)).not.toContain('MUST_DO_MISSING');
  });
});
