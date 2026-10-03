/**
 * A trip's zone on the worker, against a migrated Postgres: most trips leave their own zone empty,
 * so the day a traveller's pushes run on and the trip an imported booking lands on follow the
 * destination's zone (Đà Nẵng), not UTC or the phone's home zone.
 */
import { withSystem } from '@cp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { tripForBooking } from '../src/jobs/bookings/candidates';
import { loadRecipient } from '../src/jobs/notify/audience';
import {
  insertCrew,
  insertDevice,
  insertTripUnderWay,
  insertUser,
  startNotifyDb,
  type NotifyDb,
} from './notify-fixtures';

let db: NotifyDb;
let traveller: string;
let crewId: string;
let tripId: string;

beforeAll(async () => {
  db = await startNotifyDb();
  traveller = await insertUser(db.pool, { tz: 'Asia/Singapore' });
  await insertDevice(db.pool, traveller, { tz: 'Asia/Singapore' });
  crewId = await insertCrew(db.pool, [traveller]);
  tripId = await insertTripUnderWay(db.pool, crewId, 'UTC', [traveller]);
  const { rows } = await db.pool.query<{ id: string }>(
    `INSERT INTO destinations (slug, name, tz) VALUES ('da-nang-zone', 'Đà Nẵng', 'Asia/Ho_Chi_Minh')
     RETURNING id`,
  );
  await db.pool.query(
    "UPDATE trips SET tz = NULL, destination_id = $2, start_date = '2026-10-02', end_date = '2026-10-04' WHERE id = $1",
    [tripId, rows[0]!.id],
  );
}, 240_000);

afterAll(async () => {
  await db?.stop();
});

describe("a trip's zone on the worker", () => {
  it("runs a traveller's day on the destination's zone while the trip has none", async () => {
    const recipient = await withSystem(db.pool, (tx) =>
      loadRecipient(tx, traveller, new Date('2026-10-03T05:00:00Z')),
    );
    expect(recipient?.tz).toBe('Asia/Ho_Chi_Minh');
  });

  it("matches an imported booking to the trip by the destination's date", async () => {
    // A second trip to Đà Nẵng right after the first, also without a zone of its own.
    const { rows } = await db.pool.query<{ id: string }>(
      `INSERT INTO trips (crew_id, status, destination_id, start_date, end_date)
       SELECT crew_id, 'setup', destination_id, '2026-10-08', '2026-10-10' FROM trips WHERE id = $1
       RETURNING id`,
      [tripId],
    );
    // 01:30 on 6 Oct in Đà Nẵng (still 5 Oct in UTC): inside the second trip's window, not the first's.
    const matched = await withSystem(db.pool, (tx) =>
      tripForBooking(tx, crewId, '2026-10-05T18:30:00Z'),
    );
    expect(matched).toBe(rows[0]!.id);
  });
});
