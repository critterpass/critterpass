/**
 * Exercises `offlineSearch.ts`'s real SQLite FTS5 query logic against a real SQLite engine
 * (`better-sqlite3`, already used elsewhere in this repo) via a thin async adapter — `expo-sqlite`
 * ships (nearly) the same SQLite build, so this proves the actual schema/query, not a fake.
 */
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';

import {
  clearOfflinePlaces,
  indexPlacesOffline,
  searchPlacesOffline,
  type OfflineDb,
  type OfflinePlaceRecord,
} from '../offlineSearch';

function betterSqlite3Adapter(db: Database.Database): OfflineDb {
  return {
    execAsync: (sql) => Promise.resolve(db.exec(sql)),
    runAsync: (sql, params = []) => Promise.resolve(db.prepare(sql).run(...params)),
    getAllAsync: (sql, params = []) => Promise.resolve(db.prepare(sql).all(...params)) as never,
  };
}

const KYOTO = 'kyoto-dest-id';
const CUSCO = 'cusco-dest-id';

const NISHIKI: OfflinePlaceRecord = {
  id: 'nishiki',
  destinationId: KYOTO,
  name: 'Nishiki Market',
  iconKey: 'pin-market',
  categoryLabel: 'Market',
  lat: 35.005,
  lng: 135.765,
};
const FUSHIMI: OfflinePlaceRecord = {
  id: 'fushimi',
  destinationId: KYOTO,
  name: 'Fushimi Inari Taisha',
  iconKey: 'pin-temple-shrine',
  categoryLabel: 'Temple or shrine',
  lat: 34.967,
  lng: 135.773,
};
const SAQSAYWAMAN: OfflinePlaceRecord = {
  id: 'saqsaywaman',
  destinationId: CUSCO,
  name: 'Saqsaywaman',
  iconKey: 'pin-museum',
  categoryLabel: 'Museum',
  lat: -13.509,
  lng: -71.982,
};

let sqlite: Database.Database;
let db: OfflineDb;

beforeEach(() => {
  sqlite = new Database(':memory:');
  db = betterSqlite3Adapter(sqlite);
});

afterEach(() => {
  sqlite.close();
});

describe('offlineSearch', () => {
  it('finds a place by a prefix of its name', async () => {
    await indexPlacesOffline(db, KYOTO, [NISHIKI, FUSHIMI]);
    const results = await searchPlacesOffline(db, KYOTO, 'nish');
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual(NISHIKI);
  });

  it('returns everything for the destination when the query is blank', async () => {
    await indexPlacesOffline(db, KYOTO, [NISHIKI, FUSHIMI]);
    const results = await searchPlacesOffline(db, KYOTO, '');
    expect(results.map((r) => r.id).sort()).toEqual(['fushimi', 'nishiki']);
  });

  it('scopes results to the requested destination only', async () => {
    await indexPlacesOffline(db, KYOTO, [NISHIKI]);
    await indexPlacesOffline(db, CUSCO, [SAQSAYWAMAN]);
    const kyotoResults = await searchPlacesOffline(db, KYOTO, '');
    const cuscoResults = await searchPlacesOffline(db, CUSCO, '');
    expect(kyotoResults.map((r) => r.id)).toEqual(['nishiki']);
    expect(cuscoResults.map((r) => r.id)).toEqual(['saqsaywaman']);
  });

  it('re-indexing a destination replaces its old records rather than appending', async () => {
    await indexPlacesOffline(db, KYOTO, [NISHIKI, FUSHIMI]);
    await indexPlacesOffline(db, KYOTO, [NISHIKI]);
    const results = await searchPlacesOffline(db, KYOTO, '');
    expect(results.map((r) => r.id)).toEqual(['nishiki']);
  });

  it('returns nothing for a query that matches no indexed place', async () => {
    await indexPlacesOffline(db, KYOTO, [NISHIKI, FUSHIMI]);
    const results = await searchPlacesOffline(db, KYOTO, 'zzz-no-match');
    expect(results).toEqual([]);
  });

  it('clearing a destination removes its offline index entirely', async () => {
    await indexPlacesOffline(db, KYOTO, [NISHIKI]);
    await clearOfflinePlaces(db, KYOTO);
    const results = await searchPlacesOffline(db, KYOTO, '');
    expect(results).toEqual([]);
  });
});
