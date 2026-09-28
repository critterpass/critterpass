/**
 * `location_fixes` (C3, RLS X): no app_user SELECT at all. The writer inserts only into their own
 * open share; a viewer reads a share's fixes only through `app.shared_location_fixes`, which holds
 * only for the owner and trip participants while the share is open (crew map: boosted trips).
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
/** Crew member who is not on the trip. */
let bystanderId: string;
const device = anonymousActor().device;

function asUser<T>(uid: string, sql: string, params: unknown[] = []): Promise<T[]> {
  return withUser(db.pool, uid, device, async (tx) => (await tx.query(sql, params)).rows as T[]);
}

async function openShare(
  userId: string,
  reason: 'crew_map' | 'help' | 'sos',
  extra: { endsAt?: string; paused?: boolean } = {},
): Promise<string> {
  return withSystem(db.pool, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO location_shares (trip_id, user_id, reason, starts_at, ends_at, paused)
       VALUES ($1, $2, $3, now() - interval '1 hour', $4, $5) RETURNING id`,
      [fx.tripId, userId, reason, extra.endsAt ?? null, extra.paused ?? false],
    );
    return rows[0]!.id;
  });
}

const INSERT_FIX = `INSERT INTO location_fixes (user_id, trip_id, share_id, lat, lng, accuracy_m, mock_flags, at)
  VALUES ($1, $2, $3, -8.5, 115.26, 8, $4, now())`;

function writeFix(uid: string, shareId: string, mockFlags = 0): Promise<unknown> {
  return asUser(uid, INSERT_FIX, [uid, fx.tripId, shareId, mockFlags]);
}

function visibleFixes(uid: string, shareId: string): Promise<{ lat: number }[]> {
  return asUser(uid, 'SELECT lat FROM app.shared_location_fixes($1)', [shareId]);
}

beforeAll(async () => {
  container = await startDbTestContainer();
  db = await container.createDatabase();
  fx = await buildTripFixture(db.pool);
  bystanderId = await withSystem(db.pool, async (tx) => {
    const id = await insertUser(tx);
    await insertCrewMember(tx, { crewId: fx.crewId, userId: id });
    return id;
  });
}, 180_000);

afterAll(async () => {
  await db.drop();
  await container.stop();
});

describe('location_fixes writes', () => {
  it('lets the owner write into their own open share, mock flags stored', async () => {
    const share = await openShare(fx.memberId, 'help');
    await writeFix(fx.memberId, share, 1);
    const rows = await withSystem(db.pool, async (tx) => {
      const result = await tx.query<{ mock_flags: number }>(
        'SELECT mock_flags FROM location_fixes WHERE share_id = $1',
        [share],
      );
      return result.rows;
    });
    expect(rows).toEqual([{ mock_flags: 1 }]);
  });

  it("rejects a fix into someone else's share", async () => {
    const share = await openShare(fx.organiserId, 'help');
    await expect(writeFix(fx.memberId, share)).rejects.toThrow(/row-level security/i);
  });

  it('rejects a fix into an ended share or a paused crew-map share', async () => {
    const ended = await openShare(fx.memberId, 'help', {
      endsAt: new Date(Date.now() - 60_000).toISOString(),
    });
    await expect(writeFix(fx.memberId, ended)).rejects.toThrow(/row-level security/i);
    const paused = await openShare(fx.memberId, 'crew_map', { paused: true });
    await expect(writeFix(fx.memberId, paused)).rejects.toThrow(/row-level security/i);
  });

  it('keeps a paused SOS share writable (SOS overrides pause)', async () => {
    const sos = await openShare(fx.memberId, 'sos', { paused: true });
    await expect(writeFix(fx.memberId, sos)).resolves.toBeDefined();
  });
});

describe('location_fixes reads', () => {
  let help: string;
  let crewMap: string;

  beforeAll(async () => {
    help = await openShare(fx.organiserId, 'help');
    crewMap = await openShare(fx.organiserId, 'crew_map');
    await writeFix(fx.organiserId, help);
    await writeFix(fx.organiserId, crewMap);
  });

  it('denies a direct SELECT to everyone, the owner included', async () => {
    for (const uid of [fx.organiserId, fx.memberId, fx.outsiderId, bystanderId]) {
      await expect(asUser(uid, 'SELECT 1 FROM location_fixes')).rejects.toThrow(
        /permission denied/i,
      );
    }
  });

  it('shows an open Help share to its owner and a co-participant only', async () => {
    expect(await visibleFixes(fx.organiserId, help)).toHaveLength(1);
    expect(await visibleFixes(fx.memberId, help)).toHaveLength(1);
    expect(await visibleFixes(bystanderId, help)).toEqual([]);
    expect(await visibleFixes(fx.outsiderId, help)).toEqual([]);
    expect(await visibleFixes(anonymousActor().uid, help)).toEqual([]);
  });

  it('shows a crew-map share only while the trip is boosted', async () => {
    expect(await visibleFixes(fx.memberId, crewMap)).toEqual([]);
    await withSystem(db.pool, (tx) =>
      tx.query(
        `INSERT INTO trip_entitlements (trip_id, boost_active) VALUES ($1, true)
         ON CONFLICT (trip_id) DO UPDATE SET boost_active = true`,
        [fx.tripId],
      ),
    );
    expect(await visibleFixes(fx.memberId, crewMap)).toHaveLength(1);
    expect(await visibleFixes(bystanderId, crewMap)).toEqual([]);
  });

  it('hides a share from a participant who answered out', async () => {
    await withSystem(db.pool, (tx) =>
      tx.query("UPDATE trip_participants SET rsvp = 'out' WHERE trip_id = $1 AND user_id = $2", [
        fx.tripId,
        fx.memberId,
      ]),
    );
    try {
      expect(await visibleFixes(fx.memberId, help)).toEqual([]);
    } finally {
      await withSystem(db.pool, (tx) =>
        tx.query(
          "UPDATE trip_participants SET rsvp = 'unopened' WHERE trip_id = $1 AND user_id = $2",
          [fx.tripId, fx.memberId],
        ),
      );
    }
  });

  it('gives guide_reader nothing and keeps fixes out of the publication', async () => {
    await expect(
      withGuideReader(db.pool, fx.memberId, fx.tripId, (tx) =>
        tx.query('SELECT 1 FROM location_fixes'),
      ),
    ).rejects.toThrow(/permission denied/i);
    const { rows } = await db.pool.query<{ published: boolean; readable: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'powersync'
                        AND tablename = 'location_fixes') AS published,
              has_table_privilege('powersync_repl', 'location_fixes', 'SELECT') AS readable`,
    );
    expect(rows[0]).toEqual({ published: false, readable: false });
  });
});
