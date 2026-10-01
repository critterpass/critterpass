import { describe, expect, it } from '@jest/globals';

import type { TripRow } from '../../data/queries';
import { atDestination, awaitsArrival, hasArrived } from '../arrival';
import { boxOf } from '../destination-box';
import { balancedBreak, canHatchByHand, eggCardFor } from '../hatch-model';

const TZ = 'Asia/Ho_Chi_Minh';

function trip(overrides: Partial<TripRow> = {}): TripRow {
  return {
    id: 'trip',
    crew_id: 'crew',
    status: 'in_trip',
    start_date: '2026-10-02',
    end_date: '2026-10-04',
    tz: TZ,
    destination_id: 'dad',
    destination_name: 'Đà Nẵng',
    destination_country: 'VN',
    colour: null,
    critter_set_id: 'vn',
    guide_slug: 'chava',
    guide_name: 'Chà Vá',
    guide_id: 'g',
    landed_at: null,
    rsvp: 'in',
    egg_id: 'egg',
    egg_form_id: 'form',
    egg_hatched_at: null,
    egg_trigger: null,
    ...overrides,
  };
}

const at = (iso: string) => new Date(iso);
const never = () => false;

describe('the trip egg', () => {
  it('can be hatched by hand only once the trip is under way and it is the start date here', () => {
    expect(canHatchByHand(trip(), at('2026-10-01T16:59:00Z'), TZ)).toBe(false);
    expect(canHatchByHand(trip(), at('2026-10-01T17:00:00Z'), TZ)).toBe(true);
    expect(canHatchByHand(trip({ status: 'pre_trip' }), at('2026-10-03T00:00:00Z'), TZ)).toBe(
      false,
    );
  });

  it('waits before the trip, is ready during it, and asks to be met once hatched elsewhere', () => {
    const before = at('2026-09-30T00:00:00Z');
    const during = at('2026-10-02T03:00:00Z');
    expect(eggCardFor([trip({ status: 'pre_trip' })], before, never, TZ)?.kind).toBe('waiting');
    expect(eggCardFor([trip()], during, never, TZ)?.kind).toBe('ready');
    const hatched = trip({ egg_hatched_at: '2026-10-02T02:00:00Z' });
    expect(eggCardFor([hatched], during, never, TZ)?.kind).toBe('unseen');
    expect(eggCardFor([hatched], during, (id) => id === 'egg', TZ)).toBeNull();
  });

  it('has no card without an egg (a dropout, or before boarding)', () => {
    expect(eggCardFor([trip({ egg_id: null })], at('2026-10-02T03:00:00Z'), never, TZ)).toBeNull();
  });

  it('breaks the welcome where its two lines come out even', () => {
    expect(balancedBreak('WELCOME TO BALI')).toBe('WELCOME\nTO BALI');
    expect(balancedBreak('CHÀO MỪNG ĐẾN ĐÀ NẴNG')).toBe('CHÀO MỪNG\nĐẾN ĐÀ NẴNG');
    expect(balancedBreak('BALI')).toBe('BALI');
  });
});

/** Đà Nẵng's area as the phone receives it: a PostGIS geography in hex EWKB. */
const DA_NANG_EWKB =
  '0106000020E61000000100000001030000000100000005000000CDCCCCCCCCFC5A40AE47E17A14AE2F40D7A3703D0A175B40AE47E17A14AE2F40D7A3703D0A175B40F6285C8FC2353040CDCCCCCCCCFC5A40F6285C8FC2353040CDCCCCCCCCFC5A40AE47E17A14AE2F40';
const AIRPORT = { lat: 16.0439, lng: 108.1994 };
const SAIGON = { lat: 10.8188, lng: 106.6519 };

describe('arriving at the destination', () => {
  const area = { destination_geofence: DA_NANG_EWKB, set_country: 'VN' };
  const noGeocode = () => Promise.reject(new Error('the box decides; no geocoding'));

  it('reads the destination box from EWKB and from WKT', () => {
    const box = { west: 107.95, south: 15.84, east: 108.36, north: 16.21 };
    expect(boxOf(DA_NANG_EWKB)).toEqual(box);
    expect(
      boxOf(
        'MULTIPOLYGON(((107.95 15.84, 108.36 15.84, 108.36 16.21, 107.95 16.21, 107.95 15.84)))',
      ),
    ).toEqual(box);
    expect(boxOf(null)).toBeNull();
    expect(boxOf('not a shape')).toBeNull();
  });

  it('means inside the destination, not merely in its country', async () => {
    expect(await hasArrived(area, AIRPORT, noGeocode)).toBe(true);
    // Home in Ho Chi Minh City is in Vietnam too, and is not Đà Nẵng.
    expect(await hasArrived(area, SAIGON, noGeocode)).toBe(false);
    expect(atDestination(area, null)).toBe(false);
  });

  it('falls back to the set country code, compared with the geocoder code', async () => {
    const noBox = { destination_geofence: null, set_country: 'vn' };
    expect(await hasArrived(noBox, SAIGON, () => Promise.resolve('VN'))).toBe(true);
    expect(await hasArrived(noBox, SAIGON, () => Promise.resolve('SG'))).toBe(false);
    expect(
      await hasArrived({ ...noBox, set_country: null }, SAIGON, () => Promise.resolve('VN')),
    ).toBe(false);
  });

  it('counts from the first day, before the trip is marked under way', () => {
    const morning = at('2026-10-02T02:00:00Z'); // 09:00 in Vietnam on the start date
    const preTrip = trip({ status: 'pre_trip' });
    expect(awaitsArrival(preTrip, morning, TZ)).toBe(true);
    expect(awaitsArrival(preTrip, at('2026-10-01T10:00:00Z'), TZ)).toBe(false);
    expect(awaitsArrival(trip({ egg_hatched_at: '2026-10-02T02:00:00Z' }), morning, TZ)).toBe(
      false,
    );
    // The PASS card offers HATCH IT there and then, as an arrival; elsewhere it still waits.
    expect(eggCardFor([preTrip], morning, never, TZ, () => true)).toMatchObject({
      kind: 'ready',
      trigger: 'arrived',
    });
    expect(eggCardFor([preTrip], morning, never, TZ, () => false)?.kind).toBe('waiting');
    expect(eggCardFor([trip()], morning, never, TZ)).toMatchObject({
      kind: 'ready',
      trigger: 'manual',
    });
  });
});
