/**
 * Places offered for a day come from the area the day is spent in: on a trip with a day trip,
 * "nearby" and a too-far day's swaps stay inside the place's or the day's own area (a day-trip
 * area claims what lies in its box, whoever owns the row), and a trip of one destination reads
 * its destination's places exactly as before.
 */
import { withSystem, withUser } from '@cp/db';
import type { FitDay } from '@cp/planner';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { straightLineSource } from '../../../src/planning/fit/context';
import { nearbyPlaces } from '../../../src/planning/fit/nearby';
import { tooFarCandidates } from '../../../src/planning/fixers/too-far-candidates';
import {
  buildSetupCrew,
  startSetupHarness,
  type SetupCrew,
  type SetupHarness,
} from '../../setup/setup-harness';

let harness: SetupHarness;
let crew: SetupCrew;
let kyoto: string;
let nara: string;
const poi = new Map<string, string>();

// Tōdai-ji lies in Nara but is filed under Kyoto, the first destination that read it.
const PLACES = [
  { name: 'Kinkaku-ji', owner: 'kyoto', lat: 35.0394, lng: 135.7292 },
  { name: 'Fushimi Inari', owner: 'kyoto', lat: 34.9671, lng: 135.7727 },
  { name: 'Tōdai-ji', owner: 'kyoto', lat: 34.689, lng: 135.8398 },
  { name: 'Kasuga Taisha', owner: 'nara', lat: 34.6814, lng: 135.8484 },
  { name: 'Naramachi', owner: 'nara', lat: 34.6772, lng: 135.8296 },
] as const;

const id = (name: string) => poi.get(name) as string;
const asOrganiser = <T>(fn: Parameters<typeof withUser<T>>[3]) =>
  withUser(harness.pool, crew.organiser.uid, 'test', fn);
const travel = straightLineSource(1, 1_500);

const nearby = (name: string) =>
  asOrganiser((tx) =>
    nearbyPlaces(
      tx,
      { destinationId: kyoto, poiId: id(name), limit: 10, tripId: crew.tripId },
      travel,
    ),
  ).then((places) => places.map((place) => place.name).sort());

const swaps = (areaId: string | undefined, near: (typeof PLACES)[number]) => {
  const day = {
    stay: null,
    ...(areaId === undefined ? {} : { areaId }),
    items: [{ category: 'temple_shrine', locked: false, point: { lat: near.lat, lng: near.lng } }],
  } as unknown as FitDay;
  return asOrganiser((tx) => tooFarCandidates(tx, kyoto, day, crew.tripId)).then(({ names }) =>
    [...names.values()].sort(),
  );
};

beforeAll(async () => {
  harness = await startSetupHarness();
  crew = await buildSetupCrew(harness, 1);
  await withSystem(harness.pool, async (tx) => {
    const { rows: trip } = await tx.query<{ destination_id: string }>(
      'SELECT destination_id FROM trips WHERE id = $1',
      [crew.tripId],
    );
    kyoto = trip[0]!.destination_id;
    await tx.query(
      `UPDATE destinations
          SET place_bounds = ST_MakeEnvelope(135.5, 34.6, 136.0, 35.2, 4326)::geography
        WHERE id = $1`,
      [kyoto],
    );
    const { rows: area } = await tx.query<{ id: string }>(
      `INSERT INTO destinations (slug, name, coverage, tz, place_bounds)
       VALUES ('nara-day-trip', 'Nara', 'area', 'Asia/Tokyo',
               ST_MakeEnvelope(135.8, 34.65, 135.87, 34.71, 4326)::geography)
       RETURNING id`,
    );
    nara = area[0]!.id;
    for (const place of PLACES) {
      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO pois (destination_id, name, category, lat, lng, curation)
         VALUES ($1, $2, 'temple_shrine', $3, $4, 'editorial') RETURNING id`,
        [place.owner === 'kyoto' ? kyoto : nara, place.name, place.lat, place.lng],
      );
      poi.set(place.name, rows[0]!.id);
    }
    const { rows: version } = await tx.query<{ id: string }>(
      `INSERT INTO itinerary_versions (trip_id, visibility, status) VALUES ($1, 'crew', 'current')
       RETURNING id`,
      [crew.tripId],
    );
    for (const dayNo of [1, 2, 3]) {
      await tx.query('INSERT INTO plan_days (version_id, trip_id, day_no) VALUES ($1, $2, $3)', [
        version[0]!.id,
        crew.tripId,
        dayNo,
      ]);
    }
    await tx.query('UPDATE trips SET current_version_id = $2 WHERE id = $1', [
      crew.tripId,
      version[0]!.id,
    ]);
  });
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

describe('places offered on a trip of one destination', () => {
  it('are the destination’s own, wherever they lie', async () => {
    expect(await nearby('Kinkaku-ji')).toEqual(['Fushimi Inari', 'Tōdai-ji']);
    expect(await swaps(undefined, PLACES[0])).toEqual(['Fushimi Inari', 'Kinkaku-ji', 'Tōdai-ji']);
  });
});

describe('places offered on a trip with a day trip', () => {
  beforeAll(async () => {
    await withSystem(harness.pool, (tx) =>
      tx.query('UPDATE plan_days SET destination_id = $2 WHERE trip_id = $1 AND day_no = 2', [
        crew.tripId,
        nara,
      ]),
    );
  });

  it('nearby stays in the area the place lies in', async () => {
    expect(await nearby('Tōdai-ji')).toEqual(['Kasuga Taisha', 'Naramachi']);
    expect(await nearby('Kinkaku-ji')).toEqual(['Fushimi Inari']);
  });

  it('a too-far day swaps within the area the day is spent in', async () => {
    expect(await swaps(nara, PLACES[3])).toEqual(['Kasuga Taisha', 'Naramachi', 'Tōdai-ji']);
    expect(await swaps(kyoto, PLACES[3])).toEqual(['Fushimi Inari', 'Kinkaku-ji']);
  });
});
