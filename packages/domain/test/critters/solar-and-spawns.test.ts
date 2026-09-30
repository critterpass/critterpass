import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  holdMs,
  nextWindowSpan,
  rotationPick,
  solarConditionHolds,
  solarDay,
  spawnGate,
  windowOpenOn,
  type SpawnRuleRow,
} from '../../src/critters';

// Reference times: sunrise-sunset.org (NOAA-based, captured 2026-09-30) at low latitudes; the
// published almanac values for London's June solstice and Reykjavik's December solstice.
const REFERENCE = [
  ['Da Nang', 16.0544, 108.2022, '2026-10-03', '2026-10-02T22:36:16Z', '2026-10-03T10:36:19Z'],
  ['London', 51.5074, -0.1278, '2026-06-21', '2026-06-21T03:43:00Z', '2026-06-21T20:21:00Z'],
  ['Reykjavik', 64.1466, -21.9426, '2026-12-21', '2026-12-21T11:22:00Z', '2026-12-21T15:29:00Z'],
  ['Singapore', 1.3521, 103.8198, '2026-03-20', '2026-03-19T23:07:52Z', '2026-03-20T11:16:39Z'],
  ['Sydney', -33.8688, 151.2093, '2026-01-15', '2026-01-14T18:58:19Z', '2026-01-15T09:10:31Z'],
  ['Kyoto', 35.0116, 135.7681, '2026-04-05', '2026-04-04T20:37:17Z', '2026-04-05T09:22:09Z'],
] as const;

const TWO_MIN = 2 * 60_000;

describe('solarDay', () => {
  it.each(REFERENCE)(
    '%s is within two minutes of the reference',
    (_, lat, lng, date, rise, set) => {
      const day = solarDay(date, lat, lng);
      expect(Math.abs(day.sunrise!.getTime() - Date.parse(rise))).toBeLessThan(TWO_MIN);
      expect(Math.abs(day.sunset!.getTime() - Date.parse(set))).toBeLessThan(TWO_MIN);
    },
  );

  it('has no sunrise in polar night and counts it as dark', () => {
    const day = solarDay('2026-12-21', 78.22, 15.65);
    expect(day.sunrise).toBeNull();
    const noon = new Date('2026-12-21T11:00:00Z');
    expect(solarConditionHolds('after_dark', noon, '2026-12-21', 78.22, 15.65)).toBe(true);
    expect(solarConditionHolds('after_dark', noon, '2026-06-21', 78.22, 15.65)).toBe(false);
  });

  it('gates after_dark and by_sunrise around the Da Nang day', () => {
    const [, lat, lng, date] = REFERENCE[0];
    const at = (iso: string) => new Date(iso);
    expect(solarConditionHolds('after_dark', at('2026-10-03T11:00:00Z'), date, lat, lng)).toBe(
      true,
    );
    expect(solarConditionHolds('after_dark', at('2026-10-03T05:00:00Z'), date, lat, lng)).toBe(
      false,
    );
    expect(solarConditionHolds('after_dark', at('2026-10-02T21:00:00Z'), date, lat, lng)).toBe(
      true,
    );
    expect(solarConditionHolds('by_sunrise', at('2026-10-02T22:00:00Z'), date, lat, lng)).toBe(
      true,
    );
    expect(solarConditionHolds('by_sunrise', at('2026-10-02T23:30:00Z'), date, lat, lng)).toBe(
      false,
    );
  });
});

describe('windows', () => {
  it('opens annual ranges, including one that wraps the new year', () => {
    const muertos = { type: 'annual_range', start: '11-01', end: '11-02' } as const;
    expect(windowOpenOn(muertos, '2026-11-02')).toBe(true);
    expect(windowOpenOn(muertos, '2026-11-03')).toBe(false);
    const wrap = { type: 'annual_range', start: '12-30', end: '01-02' } as const;
    expect(windowOpenOn(wrap, '2027-01-01')).toBe(true);
    expect(windowOpenOn(wrap, '2026-12-29')).toBe(false);
  });

  it('opens month parts by thirds', () => {
    const early = { type: 'month_part', month: 4, part: 'early' } as const;
    const late = { type: 'month_part', month: 4, part: 'late' } as const;
    expect(windowOpenOn(early, '2026-04-10')).toBe(true);
    expect(windowOpenOn(early, '2026-04-11')).toBe(false);
    expect(windowOpenOn(late, '2026-04-30')).toBe(true);
  });

  it('finds the next span, and the current one from its first day', () => {
    const muertos = { type: 'annual_range', start: '11-01', end: '11-02' } as const;
    expect(nextWindowSpan(muertos, '2026-09-30')).toEqual({
      start: '2026-11-01',
      end: '2026-11-02',
    });
    expect(nextWindowSpan(muertos, '2026-11-02')).toEqual({
      start: '2026-11-01',
      end: '2026-11-02',
    });
    expect(nextWindowSpan(muertos, '2026-11-03')).toEqual({
      start: '2027-11-01',
      end: '2027-11-02',
    });
    expect(nextWindowSpan({ type: 'any_day' }, '2026-09-30')).toBeNull();
  });
});

const rule = (over: Partial<SpawnRuleRow> = {}): SpawnRuleRow => ({
  id: '01900000-0000-7000-8000-000000000001',
  key: 'cp-001:common#1',
  form_id: crypto.randomUUID(),
  kind: 'presence',
  set_id: crypto.randomUUID(),
  destination_id: null,
  poi_ids: [],
  geofences: [],
  n: null,
  dwell_s: 300,
  hold_ms: null,
  window_id: null,
  solar: null,
  min_members: null,
  foreground_only: false,
  copy: 'At the bridge',
  ...over,
});

describe('spawnGate', () => {
  const ctx = {
    at: new Date('2026-10-03T05:00:00Z'),
    localDate: '2026-10-03',
    lat: 16.0544,
    lng: 108.2022,
    window: null,
    ownedInSet: 0,
    placesDone: 0,
  };

  it('opens a presence spawn', () => {
    expect(spawnGate(rule(), ctx)).toBe('open');
  });

  it('closes outside the window and the solar condition', () => {
    const window = { type: 'annual_range', start: '11-01', end: '11-02' } as const;
    expect(spawnGate(rule({ kind: 'window' }), { ...ctx, window })).toBe('window_closed');
    expect(spawnGate(rule({ solar: 'after_dark' }), ctx)).toBe('solar_closed');
  });

  it('needs n forms of the set for set_count', () => {
    expect(spawnGate(rule({ kind: 'set_count', n: 3 }), { ...ctx, ownedInSet: 2 })).toBe(
      'needs_more_of_set',
    );
    expect(spawnGate(rule({ kind: 'set_count', n: 3 }), { ...ctx, ownedInSet: 3 })).toBe('open');
  });

  it('holds longer for legendaries unless the rule says otherwise', () => {
    expect(holdMs(rule())).toBe(1500);
    expect(holdMs(rule({ kind: 'window' }))).toBeGreaterThan(1500);
    expect(holdMs(rule({ kind: 'window', hold_ms: 1800 }))).toBe(1800);
  });
});

describe('rotationPick', () => {
  const candidates = ['c', 'a', 'b'].map((id) => ({ id }));

  it('is the same for everyone on the trip that day, whatever the order', () => {
    const one = rotationPick('trip-1', '2026-10-03', 'poi-1', candidates);
    const two = rotationPick('trip-1', '2026-10-03', 'poi-1', [...candidates].reverse());
    expect(one).toEqual(two);
  });

  it('rotates across days', () => {
    const picks = new Set(
      ['01', '02', '03', '04', '05', '06', '07', '08'].map(
        (d) => rotationPick('trip-1', `2026-10-${d}`, 'poi-1', candidates)?.id,
      ),
    );
    expect(picks.size).toBeGreaterThan(1);
  });
});

describe('nextWindowSpan termination', { timeout: 60_000 }, () => {
  it('has nothing to wait for when a range covers the whole year', () => {
    const fullYear = { type: 'annual_range', start: '01-01', end: '12-31' } as const;
    expect(nextWindowSpan(fullYear, '2026-10-01')).toBeNull();
    expect(
      nextWindowSpan({ type: 'annual_range', start: '03-01', end: '02-28' }, '2027-01-10'),
    ).toBeNull();
  });

  it('spans a range that wraps the year end, from either side', () => {
    const wrap = { type: 'annual_range', start: '12-30', end: '01-02' } as const;
    expect(nextWindowSpan(wrap, '2026-12-31')).toEqual({ start: '2026-12-30', end: '2027-01-02' });
    expect(nextWindowSpan(wrap, '2027-01-01')).toEqual({ start: '2026-12-30', end: '2027-01-02' });
    expect(nextWindowSpan(wrap, '2027-01-03')).toEqual({ start: '2027-12-30', end: '2028-01-02' });
  });

  it('spans one-day ranges, including a leap day years away', () => {
    const one = { type: 'annual_range', start: '11-02', end: '11-02' } as const;
    expect(nextWindowSpan(one, '2026-11-02')).toEqual({ start: '2026-11-02', end: '2026-11-02' });
    const leap = { type: 'annual_range', start: '02-29', end: '02-29' } as const;
    expect(nextWindowSpan(leap, '2028-03-01')).toEqual({ start: '2032-02-29', end: '2032-02-29' });
  });

  it('always terminates with a span that is open, bounded and not before its own opening', () => {
    const day = fc
      .integer({ min: 0, max: 365 * 12 })
      .map((n) => new Date(Date.UTC(2024, 0, 1) + n * 86_400_000).toISOString().slice(0, 10));
    const monthDay = fc
      .tuple(fc.integer({ min: 1, max: 12 }), fc.integer({ min: 1, max: 31 }))
      .map(([m, d]) => `${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    const rule = fc.oneof(
      fc
        .tuple(monthDay, monthDay)
        .map(([start, end]) => ({ type: 'annual_range' as const, start, end })),
      fc.record({
        type: fc.constant('month_part' as const),
        month: fc.integer({ min: 1, max: 12 }),
        part: fc.constantFrom('early' as const, 'mid' as const, 'late' as const),
      }),
    );
    fc.assert(
      fc.property(rule, day, (r, from) => {
        const span = nextWindowSpan(r, from);
        if (span === null) return;
        expect(span.start <= span.end).toBe(true);
        expect(windowOpenOn(r, span.start)).toBe(true);
        expect(windowOpenOn(r, span.end)).toBe(true);
        expect(span.end >= from).toBe(true);
      }),
      { numRuns: 300 },
    );
  });
});
