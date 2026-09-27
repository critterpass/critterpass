/**
 * `visits` (C3, RLS X): the owner alone reads and writes their POI visits; a detected (geofence)
 * visit also needs their live visit consent; deletion goes through `app.delete_own_visit`;
 * crewmates, guide_reader and PowerSync see nothing.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withGuideReader, withSystem, withUser } from '../../src/tx';
import { anonymousActor, insertCrewMember, insertUser } from '../helpers/actors';
import {
  startDbTestContainer,
  type DbTestContainer,
  type DbTestDatabase,
} from '../helpers/pg-container';
import { buildTripFixture, type TripFixture } from '../helpers/trip-fixture';

let container: DbTestContainer;
let db: DbTestDatabase;
let fx: TripFixture;
let poiId: string;
let bystanderId: string;
const device = anonymousActor().device;

function asUser<T>(uid: string, sql: string, params: unknown[] = []): Promise<T[]> {
  return withUser(db.pool, uid, device, async (tx) => (await tx.query(sql, params)).rows as T[]);
}

const INSERT_VISIT = `INSERT INTO visits (id, user_id, trip_id, poi_id, source, arrived_at)
  VALUES (uuidv7(), $1, $2, $3, $4, now()) RETURNING id`;

function recordVisit(uid: string, source: string): Promise<{ id: string }[]> {
  return asUser(uid, INSERT_VISIT, [uid, fx.tripId, poiId, source]);
}

async function setConsent(uid: string, granted: boolean): Promise<void> {
  await asUser(
    uid,
    `INSERT INTO consents (user_id, purpose, granted_at, revoked_at)
     VALUES ($1, 'visit_detection', CASE WHEN $2 THEN now() END, CASE WHEN $2 THEN NULL ELSE now() END)
     ON CONFLICT (user_id, purpose) DO UPDATE
       SET granted_at = EXCLUDED.granted_at, revoked_at = EXCLUDED.revoked_at`,
    [uid, granted],
  );
}

beforeAll(async () => {
  container = await startDbTestContainer();
  db = await container.createDatabase();
  fx = await buildTripFixture(db.pool);
  const ids = await withSystem(db.pool, async (tx) => {
    const bystander = await insertUser(tx);
    await insertCrewMember(tx, { crewId: fx.crewId, userId: bystander });
    const { rows: dest } = await tx.query<{ id: string }>(
      "INSERT INTO destinations (slug, name) VALUES ('visits-probe', 'Visits Probe') RETURNING id",
    );
    const { rows: poi } = await tx.query<{ id: string }>(
      `INSERT INTO pois (destination_id, name, category, lat, lng)
       VALUES ($1, 'Warung Probe', 'food', -8.5, 115.26) RETURNING id`,
      [dest[0]!.id],
    );
    return { bystander, poi: poi[0]!.id };
  });
  bystanderId = ids.bystander;
  poiId = ids.poi;
}, 180_000);

afterAll(async () => {
  await db.drop();
  await container.stop();
});

describe('visits RLS', () => {
  it('stores manual and expense visits for a participant without consent', async () => {
    expect(await recordVisit(fx.memberId, 'manual')).toHaveLength(1);
    expect(await recordVisit(fx.memberId, 'expense')).toHaveLength(1);
  });

  it('refuses a detected visit until visit consent is granted, and after it is revoked', async () => {
    await expect(recordVisit(fx.memberId, 'geofence')).rejects.toThrow(/row-level security/i);
    await setConsent(fx.memberId, true);
    expect(await recordVisit(fx.memberId, 'geofence')).toHaveLength(1);
    await setConsent(fx.memberId, false);
    await expect(recordVisit(fx.memberId, 'geofence')).rejects.toThrow(/row-level security/i);
  });

  it('refuses visits on a trip the caller is not on, or for someone else', async () => {
    await expect(recordVisit(bystanderId, 'manual')).rejects.toThrow(/row-level security/i);
    await expect(recordVisit(fx.outsiderId, 'manual')).rejects.toThrow(/row-level security/i);
    await expect(
      asUser(fx.organiserId, INSERT_VISIT, [fx.memberId, fx.tripId, poiId, 'manual']),
    ).rejects.toThrow(/row-level security/i);
  });

  it("lets only the owner read visits; a co-participant sees none of the member's", async () => {
    expect(await asUser(fx.memberId, 'SELECT 1 FROM visits')).toHaveLength(3);
    for (const uid of [fx.organiserId, bystanderId, fx.outsiderId, anonymousActor().uid]) {
      expect(await asUser(uid, 'SELECT 1 FROM visits')).toEqual([]);
    }
  });

  it('lets the owner close a visit but change nothing else', async () => {
    const [visit] = await recordVisit(fx.memberId, 'manual');
    const closed = await asUser(
      fx.memberId,
      "UPDATE visits SET left_at = now() + interval '5 minutes' WHERE id = $1 RETURNING id",
      [visit!.id],
    );
    expect(closed).toHaveLength(1);
    await expect(
      asUser(fx.memberId, "UPDATE visits SET source = 'geofence' WHERE id = $1", [visit!.id]),
    ).rejects.toThrow(/permission denied/i);
  });

  it('deletes only through app.delete_own_visit, and only the caller’s own', async () => {
    const [visit] = await recordVisit(fx.memberId, 'manual');
    await expect(
      asUser(fx.memberId, 'DELETE FROM visits WHERE id = $1', [visit!.id]),
    ).rejects.toThrow(/permission denied/i);
    const byOther = await asUser<{ deleted: boolean }>(
      fx.organiserId,
      'SELECT app.delete_own_visit($1) AS deleted',
      [visit!.id],
    );
    expect(byOther).toEqual([{ deleted: false }]);
    const byOwner = await asUser<{ deleted: boolean }>(
      fx.memberId,
      'SELECT app.delete_own_visit($1) AS deleted',
      [visit!.id],
    );
    expect(byOwner).toEqual([{ deleted: true }]);
  });

  it('holds no coordinates', async () => {
    const { rows } = await db.pool.query<{ column_name: string }>(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'visits'",
    );
    const names = rows.map((row) => row.column_name);
    expect(names).not.toEqual(expect.arrayContaining(['lat']));
    expect(names.some((name) => /lat|lng|geo|location/.test(name))).toBe(false);
  });

  it('gives guide_reader nothing and stays out of the publication', async () => {
    await expect(
      withGuideReader(db.pool, fx.memberId, fx.tripId, (tx) => tx.query('SELECT 1 FROM visits')),
    ).rejects.toThrow(/permission denied/i);
    const { rows } = await db.pool.query<{ published: boolean; readable: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'powersync'
                        AND tablename = 'visits') AS published,
              has_table_privilege('powersync_repl', 'visits', 'SELECT') AS readable`,
    );
    expect(rows[0]).toEqual({ published: false, readable: false });
  });
});
