import { describe, expect, it } from '@jest/globals';

import { geofenceSources } from '@cp/domain';
import Database from 'better-sqlite3';

import { dayPlan, type PlanPoiRow } from '../bridge-inputs';
import {
  createQuestPlaceStore,
  openQuestPlaces,
  QUEST_PLACE_RETRY_MS,
  questItemSql,
  questPoiSql,
  questSql,
  withQuestPlaces,
  type FetchedPlace,
  type QuestRow,
} from '../quest-places';

const TZ = 'Asia/Ho_Chi_Minh';
// 18:30 in Đà Nẵng on 3 Oct.
const NOW = Date.parse('2026-10-03T11:30:00Z');
const MIDNIGHT = '2026-10-03T17:00:00Z';
const TRIP = '01928f3e-7b1a-7c2d-8e9f-0a1b2c3d4e5f';
const ESCO = '01a0f303-4a1c-7a42-95af-f2ffa265253c';
const HAN = '01a0f303-4a1c-7a42-95af-f2ffa2652540';
const BEACH = '01a0f303-4a1c-7a42-95af-f2ffa2652541';
const HOTEL = '01a0f303-4a1c-7a42-95af-f2ffa2652542';
const CAFE = '01a0f303-4a1c-7a42-95af-f2ffa2652543';
const ITEM = '01a0f303-4a1c-7a42-95af-f2ffa2652550';

function seeded() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE quests (id TEXT, trip_id TEXT, params TEXT, local_date TEXT, ends_at TEXT, status TEXT);
    CREATE TABLE plan_items (stable_id TEXT, poi_id TEXT, status TEXT);
    CREATE TABLE pois (id TEXT, lat REAL, lng REAL, visit_radius_m INTEGER, category TEXT);
    INSERT INTO quests VALUES
      ('q-esco', '${TRIP}', '{"poi_id":"${ESCO}"}', '2026-10-03', '${MIDNIGHT}', 'active'),
      ('q-meet', '${TRIP}', '{"poi_id":"${HAN}","by_time":"20:00"}', '2026-10-03', '${MIDNIGHT}', 'offered'),
      ('q-early', '${TRIP}', '{"plan_item_id":"${ITEM}","by_time":"09:00"}', '2026-10-03', '${MIDNIGHT}', 'active'),
      ('q-done', '${TRIP}', '{"poi_id":"${BEACH}"}', '2026-10-03', '${MIDNIGHT}', 'completed'),
      ('q-closed', '${TRIP}', '{"poi_id":"${BEACH}"}', '2026-10-03', '2026-10-03T10:00:00Z', 'active'),
      ('q-yesterday', '${TRIP}', '{"poi_id":"${BEACH}"}', '2026-10-02', '${MIDNIGHT}', 'active'),
      ('q-money', '${TRIP}', '{"n":3}', '2026-10-03', '${MIDNIGHT}', 'active');
    INSERT INTO plan_items VALUES ('${ITEM}', '${CAFE}', 'removed');
    INSERT INTO pois VALUES
      ('${ESCO}', 16.06593, 108.24588, 25, 'nightlife'),
      ('${HAN}', 16.0683, 108.2241, NULL, 'market'),
      ('${CAFE}', 16.07, 108.24, NULL, 'food');
  `);
  return db;
}

describe("today's open quests name places to watch", () => {
  it('reads every open quest place, through plan items too, and none that are done or closed', () => {
    const db = seeded();
    const quests = db.prepare(questSql(TRIP)).all() as QuestRow[];
    const refs = openQuestPlaces(quests, NOW, TZ);
    expect(refs).toEqual({ poiIds: [ESCO, HAN].sort(), planItemIds: [ITEM] });
    const items = db.prepare(questItemSql(refs.planItemIds) ?? '').all() as { poi_id: string }[];
    expect(items).toEqual([{ poi_id: CAFE }]);
    const pois = db.prepare(questPoiSql([ESCO, CAFE, BEACH]) ?? '').all() as PlanPoiRow[];
    expect(pois.map((p) => [p.id, p.radius]).sort()).toEqual(
      [
        [ESCO, 25],
        [CAFE, null],
      ].sort(),
    );
    expect(questPoiSql([])).toBeNull();
    expect(questItemSql(["x' OR 1=1"])).toBeNull();
    expect(() => questSql("x' --")).toThrow(/not a uuid/);
    db.close();
  });

  it('watches a quest place off the plan and leaves a planned one to the plan', () => {
    const planned: PlanPoiRow = {
      id: HAN,
      lat: 16.0683,
      lng: 108.2241,
      radius: null,
      category: 'market',
      starts_at: '2026-10-03T12:00:00Z',
    };
    const stay: PlanPoiRow = { ...planned, id: HOTEL, category: 'stay', starts_at: null };
    const esco: PlanPoiRow = {
      id: ESCO,
      lat: 16.06593,
      lng: 108.24588,
      radius: 25,
      category: 'nightlife',
      starts_at: null,
    };
    const plan = withQuestPlaces(dayPlan(TRIP, [planned, stay], NOW, TZ), [esco, planned]);
    expect(plan.candidates.map((c) => `${c.id}:${c.category}`)).toEqual([
      `${HAN}:market`,
      `${HOTEL}:stay`,
      `${ESCO}:nightlife`,
    ]);
    const regions = geofenceSources.collect(plan.context);
    expect(regions.get('quests')).toEqual([
      { id: ESCO, lat: 16.06593, lng: 108.24588, radiusM: 25 },
    ]);
    expect(regions.get('plan_pois')?.map((c) => c.id)).toEqual([HAN]);
    const bare = dayPlan(TRIP, [planned], NOW, TZ);
    expect(withQuestPlaces(bare, [])).toBe(bare);
  });
});

describe('quest place points', () => {
  const local: PlanPoiRow = {
    id: ESCO,
    lat: 16.06593,
    lng: 108.24588,
    radius: 25,
    category: 'nightlife',
    starts_at: null,
  };
  const fetched: FetchedPlace = { id: HAN, lat: 16.0683, lng: 108.2241, category: 'market' };

  it("uses the phone's row, fetches a missing place once and keeps it for the day", async () => {
    const asked: string[] = [];
    const store = createQuestPlaceStore((id) => {
      asked.push(id);
      return Promise.resolve(id === HAN ? fetched : null);
    });
    expect(await store.fill([ESCO, HAN], [local], '2026-10-03')).toBe(true);
    expect(await store.fill([ESCO, HAN], [local], '2026-10-03')).toBe(false);
    expect(asked).toEqual([HAN]);
    expect(store.resolve([ESCO, HAN], [local], '2026-10-03')).toEqual([
      local,
      { id: HAN, lat: 16.0683, lng: 108.2241, category: 'market', radius: null, starts_at: null },
    ]);
    // A new day starts from the phone's rows again.
    expect(store.resolve([ESCO, HAN], [local], '2026-10-04')).toEqual([local]);
  });

  it('skips a place it cannot fetch offline and retries later', async () => {
    let clock = NOW;
    let online = false;
    const store = createQuestPlaceStore(
      () =>
        online ? Promise.resolve(fetched) : Promise.reject(new Error('Network request failed')),
      () => clock,
    );
    expect(await store.fill([HAN], [], '2026-10-03')).toBe(false);
    expect(store.resolve([HAN], [], '2026-10-03')).toEqual([]);
    online = true;
    expect(await store.fill([HAN], [], '2026-10-03')).toBe(false);
    clock += QUEST_PLACE_RETRY_MS;
    expect(await store.fill([HAN], [], '2026-10-03')).toBe(true);
    expect(store.resolve([HAN], [], '2026-10-03').map((row) => row.id)).toEqual([HAN]);
  });
});
