/**
 * Where a GO from a leave-by goes, over the phone's real local database: the stop's place; for a
 * flight, the departure airport of its leg (placed from the bundled airport list); and nothing
 * when neither can be placed, so the leave-by push opens the day as it did before GO.
 */

import { afterEach, describe, expect, it } from '@jest/globals';
import type { AbstractPowerSyncDatabase } from '@powersync/common';

import { leaveByGoRoute, routeForTap, type PushTap } from '@/data/push/routing';
import {
  installKey,
  MemoryKeyStore,
  openNodeDatabase,
  removeDir,
  tempDatabaseDir,
} from '@/data/powersync/test-support/open-node-database';

import { bundledAirportAt } from '../data/airport';
import { loadGoPlace, targetFromParams } from '../data/go-place';

const TRIP = '0199a1c2-7b3e-7c10-9a55-3f1f6e2d4b02';
const DEST = '0199a1c2-7b3e-7c10-9a55-3f1f6e2d4b03';
const FLIGHT_ITEM = '0199a1c2-7b3e-7c10-9a55-3f1f6e2d4b04';
const FLIGHT_BOOKING = '0199a1c2-7b3e-7c10-9a55-3f1f6e2d4b05';
const LEAVE_BY = '0199a1c2-7b3e-7c10-9a55-3f1f6e2d4b06';
const DAY_HREF = `/hub/${TRIP}/day/2026-10-04`;
// 17:00 in Đà Nẵng: the 18:25 leave-by for the 20:35 flight is next.
const NOW = new Date('2026-10-04T10:00:00Z');
const DEPARTS = '2026-10-04T13:35:00.000Z';

const opened: { db: AbstractPowerSyncDatabase; dir: string }[] = [];
afterEach(async () => {
  for (const { db, dir } of opened.splice(0)) {
    await db.close().catch(() => undefined);
    removeDir(dir);
  }
});

async function tripWithFlight(depAirport: string): Promise<AbstractPowerSyncDatabase> {
  const dir = tempDatabaseDir();
  const db = await openNodeDatabase({ dir, key: await installKey(new MemoryKeyStore()) });
  opened.push({ db, dir });
  await db.execute('INSERT INTO destinations (id, slug, name) VALUES (?, ?, ?)', [
    DEST,
    'da-nang',
    'Đà Nẵng',
  ]);
  await db.execute('INSERT INTO trips (id, destination_id) VALUES (?, ?)', [TRIP, DEST]);
  await db.execute(
    `INSERT INTO plan_items (id, trip_id, category, booking_id, starts_at)
     VALUES (?, ?, 'flight', ?, ?)`,
    [FLIGHT_ITEM, TRIP, FLIGHT_BOOKING, DEPARTS],
  );
  await db.execute(
    `INSERT INTO flight_segments (id, booking_id, trip_id, segment_no, dep_airport, arr_airport, sched_dep_at)
     VALUES (?, ?, ?, 1, ?, 'SGN', ?)`,
    ['0199a1c2-7b3e-7c10-9a55-3f1f6e2d4b07', FLIGHT_BOOKING, TRIP, depAirport, DEPARTS],
  );
  // A flight's leave-by has no place of its own.
  await db.execute(
    `INSERT INTO leave_bys (id, trip_id, plan_item_id, title, place_name, local_date, starts_at, leave_at, state)
     VALUES (?, ?, ?, 'Flight to Saigon', NULL, '2026-10-04', ?, '2026-10-04T11:25:00.000Z', 'scheduled')`,
    [LEAVE_BY, TRIP, FLIGHT_ITEM, DEPARTS],
  );
  return db;
}

const pushTap: PushTap = {
  nid: 'n-1',
  deeplink: DAY_HREF,
  type: 'leave_by_alarm',
  crewId: null,
};

describe('GO from a flight leave-by', () => {
  it('goes to the departure airport of the leg', async () => {
    const db = await tripWithFlight('DAD');
    const href = await routeForTap(pushTap, () => Promise.resolve(DAY_HREF));
    const target = targetFromParams(Object.fromEntries(new URLSearchParams(href.split('?')[1])));
    expect(target).toEqual({ kind: 'next_leave_by', tripId: TRIP, fallback: DAY_HREF });
    const place = await loadGoPlace(
      db,
      target ?? { kind: 'leave_by', leaveById: '' },
      NOW,
      bundledAirportAt,
    );
    expect(place).toMatchObject({
      poiId: null,
      tripId: TRIP,
      destinationSlug: 'da-nang',
      airport: { iata: 'DAD', city: 'Đà Nẵng' },
    });
    expect(place?.name).toMatch(/Da Nang/u);
    // Vietnam's airports carry their own names; the rest keep the bundled list's city.
    expect(bundledAirportAt('sgn')?.city).toBe('Tân Sơn Nhất');
    expect(bundledAirportAt('SIN')?.city).toBe('Singapore');
    expect(place?.lat).toBeCloseTo(16.04, 1);
    expect(place?.lng).toBeCloseTo(108.2, 1);
    await expect(
      loadGoPlace(db, { kind: 'leave_by', leaveById: LEAVE_BY }, NOW, bundledAirportAt),
    ).resolves.toMatchObject({ poiId: null, tripId: TRIP });
  });

  it('places nothing when the airport is unknown, and the push keeps the day to fall back to', async () => {
    const db = await tripWithFlight('ZZZ');
    await expect(
      loadGoPlace(
        db,
        { kind: 'next_leave_by', tripId: TRIP, fallback: DAY_HREF },
        NOW,
        bundledAirportAt,
      ),
    ).resolves.toBeNull();
    expect(leaveByGoRoute(pushTap, DAY_HREF)).toContain(`fallback=${encodeURIComponent(DAY_HREF)}`);
  });

  it('opens the day as before when the day link was routed elsewhere or failed', async () => {
    await expect(routeForTap(pushTap, () => Promise.resolve('/onboarding'))).resolves.toBe(
      '/onboarding',
    );
    await expect(routeForTap(pushTap, () => Promise.reject(new Error('down')))).resolves.toBe(
      '/inbox',
    );
    expect(
      targetFromParams({ trip: TRIP, leaveBy: 'next', fallback: 'https://evil.example' }),
    ).toEqual({
      kind: 'next_leave_by',
      tripId: TRIP,
      fallback: null,
    });
  });
});

describe('GO to a place the phone does not hold', () => {
  const PLACE = '0199b7a0-4c1e-7d2a-8f00-3a6b5c4d2e11';
  const remote = (poiId: string) =>
    Promise.resolve(
      poiId === PLACE
        ? { id: PLACE, name: 'Chùa Linh Ứng', lat: 16.1003, lng: 108.2778, address: 'Sơn Trà' }
        : null,
    );

  it('goes to the api’s place, and to nothing when the api has none', async () => {
    const dir = tempDatabaseDir();
    const db = await openNodeDatabase({ dir, key: await installKey(new MemoryKeyStore()) });
    opened.push({ db, dir });
    await expect(
      loadGoPlace(db, { kind: 'place', poiId: PLACE, tripId: TRIP }, NOW, bundledAirportAt, remote),
    ).resolves.toMatchObject({
      poiId: PLACE,
      name: 'Chùa Linh Ứng',
      lat: 16.1003,
      tripId: TRIP,
      address: 'Sơn Trà',
    });
    await expect(
      loadGoPlace(db, { kind: 'place', poiId: DEST, tripId: null }, NOW, bundledAirportAt, remote),
    ).resolves.toBeNull();
  });
});
