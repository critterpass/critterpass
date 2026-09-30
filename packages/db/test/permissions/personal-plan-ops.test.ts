/**
 * personal_plan_ops is its owner's alone: peers, organisers included, read none of it; the guide
 * reads the asking user's own active rows on the trip in context through llm.my_personal_plan_ops
 * and nothing from the base table. calendar_feed_tokens is server-only: no app_user and no guide
 * access at all.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withGuideReader, withSystem, withUser } from '../../src/tx';
import { anonymousActor } from '../helpers/actors';
import { buildPermissionFixture, type PermissionFixture } from '../helpers/fixtures';
import {
  startDbTestContainer,
  type DbTestContainer,
  type DbTestDatabase,
} from '../helpers/pg-container';

let container: DbTestContainer;
let db: DbTestDatabase;
let fixture: PermissionFixture;

const device = anonymousActor().device;
const SKIP = [
  {
    op: 'remove',
    target: '0190f0a0-0000-7000-8000-000000000002',
    reason: 'skipping the hike',
    affected_user_ids: [],
    booking_impact: false,
  },
];

const insertOwn = (uid: string, forUid = uid) =>
  withUser(db.pool, uid, device, (tx) =>
    tx.query(
      'INSERT INTO personal_plan_ops (trip_id, user_id, base_version_id, ops) VALUES ($1, $2, $3, $4)',
      [fixture.tripId, forUid, fixture.versionId, JSON.stringify(SKIP)],
    ),
  );

beforeAll(async () => {
  container = await startDbTestContainer();
  db = await container.createDatabase();
  fixture = await buildPermissionFixture(db.pool);
  await insertOwn(fixture.actors.member);
  await withSystem(db.pool, (tx) =>
    tx.query(
      `INSERT INTO personal_plan_ops (trip_id, user_id, base_version_id, ops, status)
       VALUES ($1, $2, $3, '[]', 'dropped')`,
      [fixture.tripId, fixture.actors.member, fixture.versionId],
    ),
  );
}, 180_000);

afterAll(async () => {
  await db.drop();
  await container.stop();
});

const countFor = (uid: string, owner: string) =>
  withUser(db.pool, uid, device, async (tx) => {
    const { rows } = await tx.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM personal_plan_ops WHERE user_id = $1',
      [owner],
    );
    return rows[0]?.n;
  });

describe('personal_plan_ops', () => {
  it('shows the owner their rows and every peer, organisers included, none', async () => {
    expect(await countFor(fixture.actors.member, fixture.actors.member)).toBe(2);
    for (const peer of ['organiser', 'coOrganiser', 'outsider', 'exMember'] as const) {
      expect(await countFor(fixture.actors[peer], fixture.actors.member), peer).toBe(0);
    }
  });

  it('takes rows only in the owner’s name, on a trip of their crew', async () => {
    await expect(insertOwn(fixture.actors.organiser, fixture.actors.member)).rejects.toThrow(
      /row-level security/i,
    );
    await expect(insertOwn(fixture.actors.outsider)).rejects.toThrow(/row-level security/i);
    const peerUpdate = await withUser(db.pool, fixture.actors.organiser, device, (tx) =>
      tx.query("UPDATE personal_plan_ops SET status = 'dropped' WHERE user_id = $1", [
        fixture.actors.member,
      ]),
    );
    expect(peerUpdate.rowCount).toBe(0);
  });

  it("gives the guide only the asker's own active rows, and nothing from the base table", async () => {
    const asGuide = (uid: string) =>
      withGuideReader(db.pool, uid, fixture.tripId, async (tx) => {
        const { rows } = await tx.query<{ ops: unknown[] }>(
          'SELECT ops FROM llm.my_personal_plan_ops',
        );
        return rows;
      });
    const own = await asGuide(fixture.actors.member);
    expect(own).toHaveLength(1);
    expect(own[0]?.ops).toEqual(SKIP);
    expect(await asGuide(fixture.actors.coOrganiser)).toHaveLength(0);
    await expect(
      withGuideReader(db.pool, fixture.actors.member, fixture.tripId, (tx) =>
        tx.query('SELECT 1 FROM personal_plan_ops'),
      ),
    ).rejects.toThrow(/permission denied/i);
  });
});

describe('calendar_feed_tokens', () => {
  it('is out of reach of app_user and the guide, its owner included', async () => {
    await expect(
      withUser(db.pool, fixture.actors.organiser, device, (tx) =>
        tx.query('SELECT 1 FROM calendar_feed_tokens'),
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      withGuideReader(db.pool, fixture.actors.organiser, fixture.tripId, (tx) =>
        tx.query('SELECT 1 FROM calendar_feed_tokens'),
      ),
    ).rejects.toThrow(/permission denied/i);
    const { rows } = await withSystem(db.pool, (tx) =>
      tx.query('SELECT 1 FROM calendar_feed_tokens WHERE user_id = $1', [fixture.actors.organiser]),
    );
    expect(rows).toHaveLength(1);
  });
});
