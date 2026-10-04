/**
 * The plan's trip zone: most trips leave their own zone empty, so the plan reads the
 * destination's (Đà Nẵng, not UTC), and a trip that sets its own zone keeps it.
 */
import { describe, expect, it } from '@jest/globals';

import Database from 'better-sqlite3';

import { TRIP_SQL } from '../queries';

const DA_NANG_TRIP = 'trip-da-nang';
const OVERRIDE_TRIP = 'trip-override';

function db() {
  const sqlite = new Database(':memory:');
  sqlite.exec(`
    CREATE TABLE destinations (id TEXT, name TEXT, slug TEXT, tz TEXT);
    CREATE TABLE trips (id TEXT, crew_id TEXT, tz TEXT, current_version_id TEXT,
      destination_id TEXT, start_date TEXT, status TEXT, guide_id TEXT, phase TEXT,
      end_date TEXT, draft_version_id TEXT, local_currency TEXT);
    CREATE TABLE trip_participants (trip_id TEXT, user_id TEXT, role TEXT, rsvp TEXT);
    CREATE TABLE guides (id TEXT, slug TEXT, name TEXT);
    CREATE TABLE must_dos (trip_id TEXT, poi_id TEXT, owner_id TEXT, created_at TEXT, deleted_at TEXT);
    CREATE TABLE users (id TEXT, display_name TEXT);
    INSERT INTO destinations VALUES ('dad', 'Đà Nẵng', 'da-nang', 'Asia/Ho_Chi_Minh');
    INSERT INTO trips (id, crew_id, tz, destination_id, start_date, status)
      VALUES ('${DA_NANG_TRIP}', 'crew', NULL, 'dad', '2026-10-02', 'in_trip');
    INSERT INTO trips (id, crew_id, tz, destination_id, start_date, status)
      VALUES ('${OVERRIDE_TRIP}', 'crew', 'Asia/Tokyo', 'dad', '2026-10-02', 'in_trip');
  `);
  return sqlite;
}

describe("a trip's zone in local reads", () => {
  const sqlite = db();
  const zone = (sql: string, params: unknown[]) =>
    (sqlite.prepare(sql).get(...params) as { tz: string | null }).tz;

  it("falls back to the destination's zone when the trip has none", () => {
    expect(zone(TRIP_SQL, ['me', DA_NANG_TRIP])).toBe('Asia/Ho_Chi_Minh');
  });

  it("keeps the trip's own zone when it sets one", () => {
    expect(zone(TRIP_SQL, ['me', OVERRIDE_TRIP])).toBe('Asia/Tokyo');
  });
});
