/**
 * The lock-screen offer reads the trip's zone, else its destination's (Đà Nẵng, not the phone's).
 */
import { describe, expect, it, jest } from '@jest/globals';

import Database from 'better-sqlite3';

// Only the SQL string is under test; the live-query hook beside it never runs.
jest.mock('../../../hub/data/live-rows', () => ({}));

import { TRIP_SQL } from '../offer-data';

const DA_NANG_TRIP = 'trip-da-nang';
const OVERRIDE_TRIP = 'trip-override';

function db() {
  const sqlite = new Database(':memory:');
  sqlite.exec(`
    CREATE TABLE destinations (id TEXT, name TEXT, tz TEXT);
    CREATE TABLE trips (id TEXT, crew_id TEXT, tz TEXT, current_version_id TEXT,
      destination_id TEXT, start_date TEXT, status TEXT, guide_id TEXT);
    CREATE TABLE trip_participants (trip_id TEXT, user_id TEXT, role TEXT);
    CREATE TABLE guides (id TEXT, slug TEXT);
    CREATE TABLE must_dos (trip_id TEXT, poi_id TEXT, owner_id TEXT, created_at TEXT, deleted_at TEXT);
    CREATE TABLE users (id TEXT, display_name TEXT);
    INSERT INTO destinations VALUES ('dad', 'Đà Nẵng', 'Asia/Ho_Chi_Minh');
    INSERT INTO trips VALUES ('${DA_NANG_TRIP}', 'crew', NULL, NULL, 'dad', '2026-10-02', 'in_trip', NULL);
    INSERT INTO trips VALUES ('${OVERRIDE_TRIP}', 'crew', 'Asia/Tokyo', NULL, 'dad', '2026-10-02', 'in_trip', NULL);
  `);
  return sqlite;
}

describe("a trip's zone in local reads", () => {
  const sqlite = db();
  const zone = (sql: string, params: unknown[]) =>
    (sqlite.prepare(sql).get(...params) as { tz: string | null }).tz;

  it("falls back to the destination's zone when the trip has none", () => {
    expect(zone(TRIP_SQL, [DA_NANG_TRIP])).toBe('Asia/Ho_Chi_Minh');
  });

  it("keeps the trip's own zone when it sets one", () => {
    expect(zone(TRIP_SQL, [OVERRIDE_TRIP])).toBe('Asia/Tokyo');
  });
});
