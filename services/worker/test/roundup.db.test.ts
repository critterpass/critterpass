/**
 * The evening roundup against a migrated Postgres: due in the trip zone while travelling and the
 * device zone otherwise (or when the user asked for the device zone), across DST changes; empty
 * days send nothing; five lines, needs-you first; one roundup per user per local date even when
 * the build runs twice at once; and the scan → build path through a real pg-boss.
 */
import { randomUUID } from 'node:crypto';

import { withSystem } from '@cp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createCopyRenderer } from '../src/push/render';
import {
  buildRoundup,
  dueRoundups,
  roundupBuildJob,
  roundupScanJob,
} from '../src/jobs/roundup/build';
import { rankRoundupItems } from '../src/jobs/roundup/rank';
import {
  insertCrew,
  insertDevice,
  insertTripUnderWay,
  insertUser,
  queuedJobs,
  startNotifyDb,
  until,
  type NotifyDb,
} from './notify-fixtures';

let db: NotifyDb;
const renderer = createCopyRenderer();

beforeAll(async () => {
  db = await startNotifyDb();
  await db.startBoss();
  await db.pool.query(
    "INSERT INTO guides (slug, name, colour) VALUES ('tokek', 'Tokek', 'yellow')",
  );
}, 240_000);

afterAll(async () => {
  await db.stop();
});

async function rolled(uid: string, body: string, options: { needsYou?: boolean; at?: Date } = {}) {
  await db.pool.query(
    `INSERT INTO notifications (user_id, key, category, class, sender, template_id, title, body,
       dedupe_key, local_date, state, needs_you, created_at)
     VALUES ($1, 'vote_needs_you', 'cp.vote', 'budgeted', '{"kind":"guide"}', 't', 't', $2, $3,
       CURRENT_DATE, 'rolled_into_roundup', $4, $5)`,
    [uid, body, randomUUID(), options.needsYou ?? false, options.at ?? new Date()],
  );
}

const dueUsers = async (now: Date) =>
  withSystem(db.pool, (tx) => dueRoundups(tx, now)).then((rows) => rows.map((row) => row.user_id));

describe('rankRoundupItems', () => {
  it('puts needs-you items first, then the most recent, and keeps five', () => {
    const at = (minutes: number) => new Date(Date.UTC(2026, 8, 27, 10, minutes));
    const items = [1, 2, 3, 4, 5, 6].map((n) => ({
      id: `i${n}`,
      text: `${n}`,
      needsYou: n === 2,
      createdAt: at(n),
    }));
    expect(rankRoundupItems(items).map((item) => item.id)).toEqual(['i2', 'i6', 'i5', 'i4', 'i3']);
  });
});

describe('when a roundup is due', () => {
  it('uses the trip zone while travelling and the device zone otherwise', async () => {
    const home = await insertUser(db.pool);
    await insertDevice(db.pool, home, { tz: 'Asia/Ho_Chi_Minh' });
    const traveller = await insertUser(db.pool);
    await insertDevice(db.pool, traveller, { tz: 'Asia/Ho_Chi_Minh' });
    const deviceZone = await insertUser(db.pool);
    await insertDevice(db.pool, deviceZone, { tz: 'Asia/Ho_Chi_Minh' });
    await db.pool.query(
      "INSERT INTO notification_prefs (user_id, roundup_tz) VALUES ($1, 'device')",
      [deviceZone],
    );
    const crewId = await insertCrew(db.pool, [traveller, deviceZone]);
    await insertTripUnderWay(db.pool, crewId, 'Asia/Tokyo', [traveller, deviceZone]);
    for (const uid of [home, traveller, deviceZone]) await rolled(uid, 'Boat at 08:30.');

    // 12:52 UTC: 19:52 in Ho Chi Minh City (due), 21:52 in Tokyo (long past).
    const saigonEvening = await dueUsers(new Date('2026-09-27T12:52:00Z'));
    expect(saigonEvening).toEqual(expect.arrayContaining([home, deviceZone]));
    expect(saigonEvening).not.toContain(traveller);
    // 10:52 UTC: 19:52 in Tokyo.
    const tokyoEvening = await dueUsers(new Date('2026-09-27T10:52:00Z'));
    expect(tokyoEvening).toContain(traveller);
    expect(tokyoEvening).not.toContain(home);
  });

  it('follows the local clock across DST changes', async () => {
    const uid = await insertUser(db.pool);
    await insertDevice(db.pool, uid, { tz: 'Europe/Berlin' });
    await rolled(uid, 'Rain after two.', { at: new Date('2026-10-25T12:00:00Z') });
    await rolled(uid, 'Pack a jacket.', { at: new Date('2026-03-29T12:00:00Z') });
    // 25 Oct 2026: Berlin is back on UTC+1, so 19:50 local is 18:50 UTC (not 17:50).
    expect(await dueUsers(new Date('2026-10-25T17:50:00Z'))).not.toContain(uid);
    expect(await dueUsers(new Date('2026-10-25T18:52:00Z'))).toContain(uid);
    // 29 Mar 2026: summer time, UTC+2.
    expect(await dueUsers(new Date('2026-03-29T17:52:00Z'))).toContain(uid);
  });

  it('skips users with nothing rolled up', async () => {
    const uid = await insertUser(db.pool);
    await insertDevice(db.pool, uid, { tz: 'Asia/Ho_Chi_Minh' });
    expect(await dueUsers(new Date('2026-09-27T12:52:00Z'))).not.toContain(uid);
    const outcome = await buildRoundup(
      db.pool,
      { renderer },
      { user_id: uid, local_date: '2026-09-27' },
    );
    expect(outcome).toEqual({ outcome: 'empty' });
    const { rowCount } = await db.pool.query('SELECT 1 FROM roundups WHERE user_id = $1', [uid]);
    expect(rowCount).toBe(0);
  });
});

describe('building the roundup', () => {
  it('sends five lines, needs-you first, from the guide, exactly once', async () => {
    const uid = await insertUser(db.pool);
    const { deviceId } = await insertDevice(db.pool, uid, { tz: 'Asia/Ho_Chi_Minh' });
    const base = Date.now() - 60 * 60 * 1000;
    for (let n = 1; n <= 7; n += 1) {
      await rolled(uid, `Line ${n}.`, { needsYou: n === 1, at: new Date(base + n * 60_000) });
    }
    const data = { user_id: uid, local_date: '2026-09-27' };
    const [first, second] = await Promise.all([
      buildRoundup(db.pool, { renderer }, data),
      buildRoundup(db.pool, { renderer }, data),
    ]);
    const outcomes = [first.outcome, second.outcome].sort();
    expect(outcomes).toEqual(['already_built', 'sent']);

    const { rows } = await db.pool.query<{
      title: string;
      body: string;
      ctx: { subtitle: string };
      collapse_key: string;
      sender: { name: string };
    }>(
      "SELECT title, body, ctx, collapse_key, sender FROM notifications WHERE user_id = $1 AND key = 'evening_roundup'",
      [uid],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      title: "Tokek's evening roundup",
      ctx: { subtitle: '5 things for tomorrow' },
      body: '1. Line 1.\n2. Line 7.\n3. Line 6.\n4. Line 5.\n5. Line 4.',
      collapse_key: 'roundup:2026-09-27',
      sender: { name: 'Tokek' },
    });
    const pushes = (await queuedJobs(db.pool, 'push.send')).filter(
      (job) => job.data['device_id'] === deviceId,
    );
    expect(pushes).toHaveLength(1);
    const roundups = await db.pool.query<{ lines: unknown[]; sent_at: Date | null }>(
      'SELECT lines, sent_at FROM roundups WHERE user_id = $1',
      [uid],
    );
    expect(roundups.rows).toHaveLength(1);
    expect(roundups.rows[0]?.lines).toHaveLength(5);
    expect(roundups.rows[0]?.sent_at).toBeInstanceOf(Date);
    // Tomorrow starts from what rolled up after this roundup.
    const tomorrow = await buildRoundup(
      db.pool,
      { renderer },
      { user_id: uid, local_date: '2026-09-28' },
    );
    expect(tomorrow).toEqual({ outcome: 'empty' });
  });

  it('runs from the scan through pg-boss', async () => {
    const uid = await insertUser(db.pool);
    await insertDevice(db.pool, uid, { tz: 'Asia/Ho_Chi_Minh' });
    const now = () => new Date(new Date().setUTCHours(12, 52, 0, 0));
    await rolled(uid, 'Dev owes you $41.', { at: new Date(now().getTime() - 30 * 60_000) });
    const build = roundupBuildJob({ renderer, now });
    const boss = await db.startBoss([build, roundupScanJob(build, now)]);
    await boss.send('roundup.scan', {});
    await until(async () => {
      const { rowCount } = await db.pool.query('SELECT 1 FROM roundups WHERE user_id = $1', [uid]);
      return rowCount === 1;
    });
  });
});
