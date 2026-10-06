/**
 * `set_day_area` and `clear_day_area` on the real stack: a day of the organiser's draft is spent in
 * a day-trip area and back; a place of the city on that day goes back to Ideas while a dropped pin
 * stays; a crew plan takes the change as a new version; the switch, a member, an area with no link,
 * another time zone, a missing day, a stale base and a drafting guide are refused.
 */
import { randomUUID } from 'node:crypto';

import { withSystem } from '@cp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerDraftCommands } from '../../../src/commands/draft';
import { registerPlanCommands } from '../../../src/commands/plan';
import { clearDayAreaCommand } from '../../../src/planning/areas/clear-day-area';
import { setDayAreaCommand } from '../../../src/planning/areas/set-day-area';
import { seedCurrentPlan } from '../../plan/plan-fixture';
import {
  buildSetupCrew,
  errorOf,
  resultOf,
  startSetupHarness,
  type SetupCrew,
  type SetupHarness,
  type SignedIn,
} from '../../setup/setup-harness';

let harness: SetupHarness;
let crew: SetupCrew;
const place = { kyoto: '', nara: '', kobe: '', busan: '', temple: '', deer: '' };
const pinStop = randomUUID();
const templeStop = randomUUID();
const deerStop = randomUUID();
const SOURCES = JSON.stringify([
  { url: 'https://example.org/nara', title: 'Nara', quote: '45 min' },
]);

const day = (offset: number) =>
  new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
const tokyo = (date: string, hour: number) =>
  new Date(`${date}T${String(hour).padStart(2, '0')}:00:00+09:00`).toISOString();

const switchAreas = (on: boolean) =>
  harness.pool.query("UPDATE ops.ops_config SET value = $1::jsonb WHERE key = 'trip.areas'", [
    JSON.stringify(on),
  ]);

const draftOf = async (tripId = crew.tripId): Promise<string> => {
  const { rows } = await harness.pool.query<{ v: string }>(
    'SELECT coalesce(current_version_id, draft_version_id) AS v FROM trips WHERE id = $1',
    [tripId],
  );
  return rows[0]!.v;
};

const setArea = (
  who: SignedIn,
  base: string,
  dayNo: number,
  areaId: string,
  tripId = crew.tripId,
) =>
  harness.run(who, 'set_day_area', {
    trip_id: tripId,
    base_version: base,
    day_no: dayNo,
    destination_id: areaId,
  });

const dayAreas = async (versionId: string) => {
  const { rows } = await harness.pool.query<{ destination_id: string | null }>(
    'SELECT destination_id FROM plan_days WHERE version_id = $1 ORDER BY day_no',
    [versionId],
  );
  return rows.map((row) => row.destination_id);
};

const stableIds = async (versionId: string) => {
  const { rows } = await harness.pool.query<{ stable_id: string }>(
    'SELECT stable_id FROM plan_items WHERE version_id = $1 ORDER BY stable_id',
    [versionId],
  );
  return rows.map((row) => row.stable_id);
};

const addStop = (
  stableId: string,
  dayNo: number,
  hour: number,
  where: Record<string, unknown>,
) => ({
  op: 'add',
  item: stableId,
  new: {
    day_no: dayNo,
    starts_at: tokyo(day(39 + dayNo), hour),
    ends_at: tokyo(day(39 + dayNo), hour + 1),
    tz: 'Asia/Tokyo',
    category: 'activity',
    ...where,
  },
});

beforeAll(async () => {
  harness = await startSetupHarness((registry) => {
    registerDraftCommands(registry);
    registerPlanCommands(registry);
    registry.register(setDayAreaCommand);
    registry.register(clearDayAreaCommand);
  });
  crew = await buildSetupCrew(harness, 2);
  await withSystem(harness.pool, async (tx) => {
    const { rows: trip } = await tx.query<{ destination_id: string }>(
      'SELECT destination_id FROM trips WHERE id = $1',
      [crew.tripId],
    );
    place.kyoto = trip[0]!.destination_id;
    const area = async (slug: string, name: string, tz: string) => {
      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO destinations (slug, name, coverage, currency, tz)
         VALUES ($1, $2, 'area', 'USD', $3) RETURNING id`,
        [`${slug}-${randomUUID().slice(0, 8)}`, name, tz],
      );
      return rows[0]!.id;
    };
    place.nara = await area('nara', 'Nara', 'Asia/Tokyo');
    place.kobe = await area('kobe', 'Kobe', 'Asia/Tokyo');
    place.busan = await area('busan', 'Busan', 'Asia/Seoul');
    for (const [to, mode] of [
      [place.nara, 'train'],
      [place.busan, 'flight'],
    ] as const) {
      await tx.query(
        `INSERT INTO destination_links (key, from_destination_id, to_destination_id, kind, minutes,
                                        mode, day_length, sources)
         VALUES ($1, $2, $3, 'day_trip', 60, $4, 'full', $5)`,
        [`kyoto>${to}:day_trip`, place.kyoto, to, mode, SOURCES],
      );
    }
    const poi = async (destinationId: string, name: string) => {
      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO pois (destination_id, name, category, lat, lng)
         VALUES ($1, $2, 'temple_shrine', 35.0, 135.7) RETURNING id`,
        [destinationId, name],
      );
      return rows[0]!.id;
    };
    place.temple = await poi(place.kyoto, 'Kiyomizu-dera');
    place.deer = await poi(place.nara, 'Nara Park');
  });
  await switchAreas(true);
  const locked = await harness.run(crew.organiser, 'lock_trip_dates', {
    trip_id: crew.tripId,
    start: day(40),
    end: day(43),
  });
  if (locked.status !== 200) throw new Error(JSON.stringify(locked.body));
  await harness.run(crew.organiser, 'ensure_plan_days', { trip_id: crew.tripId });
  const added = await harness.run(crew.organiser, 'apply_draft_ops', {
    trip_id: crew.tripId,
    base_version: await draftOf(),
    ops: [
      addStop(templeStop, 2, 9, { poi_id: place.temple }),
      addStop(pinStop, 2, 18, { custom_place: { name: 'Hotel bar', lat: 35.0, lng: 135.7 } }),
    ],
  });
  if (added.status !== 200) throw new Error(JSON.stringify(added.body));
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

describe('set_day_area and clear_day_area', () => {
  it('is refused while the switch is off, to a member and for a stale base', async () => {
    const base = await draftOf();
    await switchAreas(false);
    expect(errorOf(await setArea(crew.organiser, base, 2, place.nara))).toMatchObject({
      code: 'STATE_INVALID',
      detail: { reason: 'trip_areas_off' },
    });
    await switchAreas(true);
    const member = crew.members[1] as SignedIn;
    expect(errorOf(await setArea(member, base, 2, place.nara)).code).toBe('FORBIDDEN');
    expect(errorOf(await setArea(crew.organiser, randomUUID(), 2, place.nara))).toMatchObject({
      code: 'PLAN_VERSION_CONFLICT',
      detail: { latest: base },
    });
  });

  it('refuses an area with no day trip, another time zone and a day the trip lacks', async () => {
    const base = await draftOf();
    const reason = async (dayNo: number, areaId: string) =>
      errorOf(await setArea(crew.organiser, base, dayNo, areaId)).detail?.['reason'];
    expect(await reason(2, place.kobe)).toBe('not_a_day_trip');
    expect(await reason(2, place.busan)).toBe('other_time_zone');
    expect(await reason(9, place.nara)).toBe('unknown_day');
    expect(await draftOf()).toBe(base);
  });

  it('refuses while the guide is drafting', async () => {
    await harness.pool.query("UPDATE trips SET status = 'drafting' WHERE id = $1", [crew.tripId]);
    try {
      expect(
        errorOf(await setArea(crew.organiser, await draftOf(), 2, place.nara)).detail,
      ).toMatchObject({ reason: 'draft_running' });
    } finally {
      await harness.pool.query("UPDATE trips SET status = 'setup' WHERE id = $1", [crew.tripId]);
    }
  });

  it('spends a draft day in the area: the city place goes to Ideas, the pin stays', async () => {
    const base = await draftOf();
    const response = await setArea(crew.organiser, base, 2, place.nara);
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    const result = resultOf<{ version_id: string; moved_stops?: unknown[] }>(response);
    expect(result.moved_stops).toEqual([{ stable_id: templeStop, to: 'ideas' }]);
    expect(await draftOf()).toBe(result.version_id);
    expect(await dayAreas(result.version_id)).toEqual([null, place.nara, null, null]);
    expect(await stableIds(result.version_id)).toEqual([pinStop]);
    const { rows } = await harness.pool.query(
      `SELECT (SELECT visibility FROM itinerary_versions WHERE id = $2) AS visibility,
              EXISTS (SELECT 1 FROM trip_ideas WHERE trip_id = $1 AND poi_id = $3
                         AND deleted_at IS NULL) AS idea,
              (SELECT count(*)::int FROM domain_events
                WHERE aggregate_id = $1 AND type = 'trip.areas_changed') AS events`,
      [crew.tripId, result.version_id, place.temple],
    );
    expect(rows[0]).toEqual({ visibility: 'organiser', idea: true, events: 1 });
  });

  it("clears the area: the area's place goes back to Ideas", async () => {
    const added = await harness.run(crew.organiser, 'apply_draft_ops', {
      trip_id: crew.tripId,
      base_version: await draftOf(),
      ops: [addStop(deerStop, 2, 11, { poi_id: place.deer })],
    });
    expect(added.status).toBe(200);
    const cleared = await harness.run(crew.organiser, 'clear_day_area', {
      trip_id: crew.tripId,
      base_version: await draftOf(),
      day_no: 2,
    });
    expect(cleared.status, JSON.stringify(cleared.body)).toBe(200);
    const result = resultOf<{ version_id: string; moved_stops?: unknown[] }>(cleared);
    expect(result.moved_stops).toEqual([{ stable_id: deerStop, to: 'ideas' }]);
    expect(await dayAreas(result.version_id)).toEqual([null, null, null, null]);
    expect(await stableIds(result.version_id)).toEqual([pinStop]);
  });

  it("lands on the crew's plan as a new current version", async () => {
    const other = await buildSetupCrew(harness, 1);
    await harness.pool.query(
      "UPDATE trips SET destination_id = $2, tz = 'Asia/Tokyo' WHERE id = $1",
      [other.tripId, place.kyoto],
    );
    const plan = await seedCurrentPlan(harness.pool, other.tripId);
    const response = await setArea(other.organiser, plan.versionId, 3, place.nara, other.tripId);
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    const { version_id: versionId } = resultOf<{ version_id: string }>(response);
    expect(await draftOf(other.tripId)).toBe(versionId);
    expect(await dayAreas(versionId)).toEqual([null, null, place.nara]);
    const { rows } = await harness.pool.query(
      `SELECT (SELECT status FROM itinerary_versions WHERE id = $2) AS base,
              (SELECT visibility FROM itinerary_versions WHERE id = $3) AS visibility,
              (SELECT count(*)::int FROM domain_events
                WHERE aggregate_id = $1 AND type = 'plan.ops_applied') AS applied`,
      [other.tripId, plan.versionId, versionId],
    );
    expect(rows[0]).toEqual({ base: 'superseded', visibility: 'crew', applied: 1 });
  });
});
