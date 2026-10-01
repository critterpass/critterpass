/**
 * The profile's numbers and rows: what a fresh account sees a minute after onboarding, how the
 * stamps row orders and caps itself, what a crew's line says, and that odd rows never break it.
 */
import { describe, expect, it } from '@jest/globals';

import { tokens } from '@cp/design-tokens';
import type { AirportDataset } from '@cp/domain';

import { buildProfile, STAMPS_SHOWN, type ProfileInput } from '../profile-model';
import type { MeRow, StampRow } from '../profile-queries';

const AIRPORTS: AirportDataset = {
  airports: [
    {
      iata: 'SGN',
      name: 'Tan Son Nhat',
      city: 'Hồ Chí Minh City',
      country: 'VN',
      lat: 10.8,
      lng: 106.6,
      rank: 1,
    },
  ],
  metros: [],
  countries: { VN: { iso3: 'VNM', currency: 'VND' } },
} as unknown as AirportDataset;

const ME: MeRow = {
  display_name: 'Khánh',
  username: null,
  home_airport: 'SGN',
  home_country: 'VN',
  member_since: '2026-10-01',
  pass_number: 'CP-0012',
  avatar_kind: 'initials',
  avatar_form_id: null,
  avatar_ring: null,
  taste_tags: '["street_food","coffee","not_a_tag"]',
  pass_plus: 0,
};

function input(over: Partial<ProfileInput> = {}): ProfileInput {
  return {
    me: ME,
    stamps: [],
    trips: [],
    pastTrips: [],
    critters: 0,
    crews: [],
    crewMembers: [],
    crewTrips: [],
    airports: AIRPORTS,
    today: '2026-10-01',
    ...over,
  };
}

function stamp(over: Partial<StampRow>): StampRow {
  return {
    id: 's',
    kind: 'trip',
    seq_no: 2,
    iata: null,
    country: null,
    ink_colour: null,
    status: 'stamped',
    stamped_at: null,
    dates: null,
    destination_name: 'Lisbon',
    destination_colour: null,
    trip_start: null,
    ...over,
  };
}

describe('buildProfile', () => {
  it('shows a fresh account its name, home, one country and the home stamp', () => {
    const model = buildProfile(
      input({ stamps: [stamp({ id: 'h', kind: 'home', seq_no: 1, iata: 'SGN' })] }),
    );
    expect(model).toMatchObject({
      name: 'Khánh',
      username: null,
      homeCity: 'Hồ Chí Minh City',
      avatar: { kind: 'initials' },
      passPlus: false,
      stats: { trips: 0, countries: 1, critters: 0 },
      stampTotal: 1,
      tags: ['street_food', 'coffee'],
      crews: [],
      sinceYear: 2026,
    });
    expect(model.stamps).toEqual([
      { id: 'h', kind: 'home', title: 'SGN', date: null, daysUntil: null, ink: null },
    ]);
    expect(model.mrz).toBe('P<VNMKHANH<<CP0012');
  });

  it('still builds before the users row has synced', () => {
    const model = buildProfile(input({ me: null }));
    expect(model).toMatchObject({ name: '', homeCity: null, tags: [], mrz: 'P<CP<<CP' });
  });

  it('counts trips taken and self-reported ones, but only found locals as critters', () => {
    const model = buildProfile(
      input({
        trips: [{ id: 't1', start_date: '2025-03-01', country: 'JP' }],
        pastTrips: [{ id: 'p1', country: 'PT', month: '2019-06-01', place_id: null }],
        critters: 3,
      }),
    );
    expect(model.stats).toEqual({ trips: 2, countries: 3, critters: 3 });
    expect(model.sinceYear).toBe(2019);
  });

  it('orders stamps newest first, home after the trips, and keeps the next trip in view', () => {
    const trips = ['2020', '2021', '2022', '2023', '2024'].map((year, index) =>
      stamp({ id: `t${year}`, seq_no: index + 2, dates: `[${year}-05-01,${year}-05-09)` }),
    );
    const model = buildProfile(
      input({
        stamps: [
          stamp({ id: 'h', kind: 'home', seq_no: 1, iata: 'SGN' }),
          ...trips,
          stamp({
            id: 'next',
            seq_no: 9,
            status: 'upcoming',
            destination_name: 'Bali',
            trip_start: '2026-10-18',
            destination_colour: tokens.color.pink,
          }),
        ],
      }),
    );
    expect(model.stampTotal).toBe(7);
    expect(model.stamps).toHaveLength(STAMPS_SHOWN);
    expect(model.stamps.map((s) => s.id)).toEqual(['t2024', 't2023', 't2022', 't2021', 'next']);
    expect(model.stamps[4]).toMatchObject({
      kind: 'upcoming',
      daysUntil: 17,
      ink: tokens.color.pink,
    });
  });

  it('writes a crew line for the next trip, a trip in planning, a past trip, or none', () => {
    const crews = ['a', 'b', 'c', 'd'].map((id) => ({ id, name: `Crew ${id}` }));
    const model = buildProfile(
      input({
        crews,
        crewMembers: [
          { crew_id: 'a', user_id: 'u1', display_name: 'Maya' },
          { crew_id: 'a', user_id: 'u2', display_name: 'Jordan' },
        ],
        crewTrips: [
          { id: '1', crew_id: 'a', start_date: '2024-06-03', destination_name: 'Lisbon' },
          { id: '2', crew_id: 'a', start_date: '2026-10-18', destination_name: 'Bali' },
          { id: '3', crew_id: 'b', start_date: null, destination_name: null },
          { id: '4', crew_id: 'c', start_date: '2024-06-03', destination_name: 'Lisbon' },
        ],
      }),
    );
    expect(model.crews.map((crew) => crew.line)).toEqual([
      { kind: 'upcoming', place: 'Bali', days: 17 },
      { kind: 'planning', place: null },
      { kind: 'past', place: 'Lisbon', date: '2024-06-03' },
      { kind: 'none' },
    ]);
    expect(model.crews[0]?.members).toEqual([
      { id: 'u1', name: 'Maya', joinIndex: 0 },
      { id: 'u2', name: 'Jordan', joinIndex: 1 },
    ]);
  });

  it('shows the first five travel style tags however many the quiz gave', () => {
    const tags = ['street_food', 'coffee', 'easy_pace', 'markets', 'temples', 'beach', 'hiking'];
    const model = buildProfile(input({ me: { ...ME, taste_tags: JSON.stringify(tags) } }));
    expect(model.tags).toEqual(tags.slice(0, 5));
  });

  it('wears the guide sticker picked as an avatar and reads Pass+', () => {
    const model = buildProfile(
      input({ me: { ...ME, avatar_kind: 'critter', avatar_form_id: 'guide:tokek', pass_plus: 1 } }),
    );
    expect(model.avatar).toEqual({ kind: 'guide', guide: 'tokek' });
    expect(model.passPlus).toBe(true);
  });
});
