import { describe, expect, it } from 'vitest';

import { askPostText, buildAskPost, type AskPostTemplates } from './ask-post';
import { compareColumn, compareRisk, type CompareCandidate } from './compare';
import { pickupGapFor, type GapStop } from './pickup-gaps';
import { whatsappLink } from './whatsapp';

const made: CompareCandidate = {
  id: 'made',
  name: 'Made',
  priceMinor: 650_000,
  currency: 'IDR',
  priceUnit: 'day',
  includedHours: 10,
  seats: 6,
  includes: { fuel: 'yes', parking: 'yes' },
  overtimeMinor: null,
  licenceShown: null,
  supplier: false,
};
const komang: CompareCandidate = {
  ...made,
  id: 'komang',
  name: 'Komang',
  priceMinor: 900_000,
  seats: 10,
  includes: { fuel: 'yes', parking: 'yes', tolls: 'yes', entry: 'no' },
  overtimeMinor: 75_000,
  licenceShown: true,
};
const days = [
  { date: '2026-10-14', hours: 11.5 },
  { date: '2026-10-18', hours: 8.5 },
];

describe('compare', () => {
  it("turns a per-car day price into each person's share for the chosen days", () => {
    const column = compareColumn(made, days, 6);
    expect(column.eachMinor).toBe(216_667);
    expect(column.cars).toBe(1);
    expect(column.notSaid).toEqual(['tolls', 'entry', 'overtime', 'licence']);
    expect(column.longDays.map((day) => day.date)).toEqual(['2026-10-14']);
  });

  it('needs a second car when the party outgrows the seats, and a group price is not per car', () => {
    expect(compareColumn(made, days, 8)).toMatchObject({ cars: 2, eachMinor: 325_000 });
    const tour = { ...made, priceUnit: 'group' as const, seats: 4, supplier: true };
    expect(compareColumn(tour, days, 8)).toMatchObject({ eachMinor: 162_500, notSaid: [] });
    expect(compareColumn({ ...made, priceUnit: 'trip' }, days, 5).eachMinor).toBe(130_000);
  });

  it('names the cheapest driver whose price does not cover a long day and who has not said overtime', () => {
    expect(compareRisk([made, komang], days, 6)).toEqual({
      kind: 'overtime_unknown',
      name: 'Made',
      date: '2026-10-14',
    });
    expect(compareRisk([{ ...made, overtimeMinor: 50_000 }, komang], days, 6)).toMatchObject({
      kind: 'over_hours',
    });
    const short = [{ date: '2026-10-18', hours: 8 }];
    expect(compareRisk([made, komang], short, 6)).toEqual({
      kind: 'not_said',
      name: 'Made',
      count: 4,
    });
    expect(compareRisk([komang], short, 12)).toEqual({ kind: 'seats_short', name: 'Komang', cars: 2 });
    expect(compareRisk([{ ...komang, includes: { tolls: 'yes', entry: 'yes' } }], short, 6)).toEqual(
      { kind: 'all_clear', name: 'Komang' },
    );
    expect(compareRisk([{ ...made, priceMinor: null, currency: null }], days, 6)).toBeNull();
  });

  it('ranks drivers in different currencies through the given converter', () => {
    const usd = { ...komang, id: 'klook', name: 'Klook car', currency: 'USD', priceMinor: 5_000 };
    const toCommon = (minor: number, currency: string) =>
      currency === 'USD' ? minor * 160 : minor;
    expect(compareRisk([komang, usd], [{ date: 'd', hours: 8 }], 6, toCommon)).toMatchObject({
      name: 'Klook car',
    });
  });
});

const stop = (name: string, lat: number, lng: number, starts: string | null, ends: string | null): GapStop => ({
  name,
  lat,
  lng,
  starts,
  ends,
});
const ubud = { lat: -8.5069, lng: 115.2625 };

describe('pickup gaps', () => {
  it('flags a long day out to a place far from the stay', () => {
    const day = {
      date: '2026-10-14',
      stops: [
        stop('Tegallalang', -8.4333, 115.2789, '06:30', '08:00'),
        stop('Jatiluwih', -8.3708, 115.1314, '10:00', '15:00'),
        stop('Ubud ridge walk', -8.5, 115.255, '16:30', '18:00'),
      ],
    };
    expect(pickupGapFor(day, ubud, true)).toMatchObject({
      reason: 'day_out',
      place: 'Jatiluwih',
      window: { start: '06:30', end: '18:00' },
    });
  });

  it('flags only the evening when a nearby day comes back late from far out', () => {
    const day = {
      date: '2026-10-18',
      stops: [
        stop('Ubud market', -8.507, 115.263, '13:00', '14:00'),
        stop('Uluwatu kecak', -8.8291, 115.0849, '18:00', '21:30'),
      ],
    };
    expect(pickupGapFor(day, ubud, true)?.reason).toBe('late_return');
  });

  it('leaves a day in town alone where ride apps work, and flags it where none do', () => {
    const day = {
      date: '2026-10-15',
      stops: [
        stop('Monkey Forest', -8.5188, 115.2585, '09:00', '11:00'),
        stop('Campuhan', -8.5003, 115.2533, '12:00', '13:00'),
        stop('Tegallalang', -8.4333, 115.2789, '14:00', '16:00'),
      ],
    };
    expect(pickupGapFor(day, ubud, true)).toBeNull();
    expect(pickupGapFor(day, ubud, false)?.reason).toBe('no_ride_app');
    expect(pickupGapFor({ date: 'x', stops: [] }, ubud, false)).toBeNull();
  });
});

const en: AskPostTemplates = {
  body: 'Hi all, looking for a driver in {area} for {party}.\n\n{legs}\n\nNeed {seats}, {language} please.{budget} Thanks!',
  budget: ' Budget around {amount}.',
  leg: '{date}: {route}, {start} to about {end}',
  legNoTime: '{date}: {route}',
};

describe('ask post', () => {
  const values = {
    area: 'Ubud',
    party: '6 adults',
    seats: '7+ seats',
    language: 'English',
    budget: null,
    legs: [
      { date: 'Wed 14 Oct', route: 'Ubud → Jatiluwih → Ubud', start: '06:30', end: '18:00' },
      { date: 'Sun 18 Oct', route: 'Ubud → Uluwatu → Ubud', start: null, end: null },
    ],
  };

  it('fills the template from the trip and leaves the budget out until it is added', () => {
    const text = askPostText(buildAskPost(en, values));
    expect(text).toBe(
      'Hi all, looking for a driver in Ubud for 6 adults.\n\nWed 14 Oct: Ubud → Jatiluwih → Ubud, 06:30 to about 18:00\nSun 18 Oct: Ubud → Uluwatu → Ubud\n\nNeed 7+ seats, English please. Thanks!',
    );
    expect(text).not.toMatch(/Budget/u);
  });

  it('marks every editable value as a slot and rewrites around an edited one', () => {
    const segments = buildAskPost(en, { ...values, party: '4 adults', budget: 'Rp 700k a day' });
    expect(segments.filter((s) => s.kind === 'slot').map((s) => [s.slot, s.text])).toEqual([
      ['party', '4 adults'],
      ['seats', '7+ seats'],
      ['language', 'English'],
      ['budget', 'Rp 700k a day'],
    ]);
    expect(askPostText(segments)).toContain('Budget around Rp 700k a day. Thanks!');
  });
});

describe('whatsapp', () => {
  it('opens the number with the message filled in, never a malformed number', () => {
    expect(whatsappLink('+6281234567890', 'Hi Made, tolls?')).toBe(
      'https://wa.me/6281234567890?text=Hi%20Made%2C%20tolls%3F',
    );
    expect(whatsappLink('0812 3456', 'x')).toBeNull();
  });
});
