/**
 * Devices, push tokens and the notification router's tables (docs/data-model.md §3.11): RLS class O
 * everywhere. A user reads and writes only their own devices, prefs and scheduled deliveries; the
 * router's rows (notifications, ledger, roundups, inbox) are system-written and owner-read; push
 * tokens are readable through the owning device only and never synced. The `me` stream carries the
 * same rows to their owner and nobody else.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem, withUser } from '../../src/tx';
import { idsByTable, startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;

beforeAll(async () => {
  harness = await startStreamHarness();
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

const device = () => randomUUID();

function asUser<T>(uid: string, fn: Parameters<typeof withUser<T>>[3]): Promise<T> {
  return withUser(harness.db.pool, uid, device(), fn);
}

async function insertDevice(uid: string): Promise<string> {
  const id = randomUUID();
  await asUser(uid, (tx) =>
    tx.query(
      `INSERT INTO devices (id, user_id, platform, app_version, locale, tz)
       VALUES ($1, $2, 'android', '1.0.0', 'en', 'Asia/Ho_Chi_Minh')`,
      [id, uid],
    ),
  );
  return id;
}

const OWNER_TABLES = [
  'devices',
  'notifications',
  'notification_prefs',
  'ping_ledger',
  'roundups',
  'inbox_items',
  'scheduled_deliveries',
] as const;

describe('outsiders never see another user’s devices or notifications', () => {
  it.each(OWNER_TABLES)(
    '%s: organiser sees their own row, outsider sees nothing',
    async (table) => {
      const { actors } = harness.fixture;
      const sql = `SELECT 1 FROM ${table} WHERE user_id = $1`;
      const own = await asUser(actors.organiser, (tx) => tx.query(sql, [actors.organiser]));
      expect(own.rowCount).toBeGreaterThan(0);
      const other = await asUser(actors.outsider, (tx) => tx.query(sql, [actors.organiser]));
      expect(other.rowCount).toBe(0);
    },
  );

  it('push tokens are readable only through a device the reader owns', async () => {
    const { actors } = harness.fixture;
    const sql =
      'SELECT t.token FROM push_tokens t JOIN devices d ON d.id = t.device_id WHERE d.user_id = $1';
    expect(
      (await asUser(actors.organiser, (tx) => tx.query(sql, [actors.organiser]))).rowCount,
    ).toBe(1);
    const unjoined = await asUser(actors.outsider, (tx) => tx.query('SELECT 1 FROM push_tokens'));
    expect(unjoined.rowCount).toBe(0);
  });
});

describe('writes', () => {
  it('a user registers their own device but never one owned by someone else', async () => {
    const { actors } = harness.fixture;
    await expect(insertDevice(actors.member)).resolves.toBeDefined();
    await expect(
      asUser(actors.outsider, (tx) =>
        tx.query(
          `INSERT INTO devices (id, user_id, platform, app_version, locale, tz)
           VALUES ($1, $2, 'ios', '1.0.0', 'en', 'UTC')`,
          [randomUUID(), actors.member],
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('cannot take over another user’s device row by id', async () => {
    const { actors } = harness.fixture;
    const id = await insertDevice(actors.member);
    const moved = await asUser(actors.outsider, (tx) =>
      tx.query('UPDATE devices SET user_id = $2 WHERE id = $1', [id, actors.outsider]),
    );
    expect(moved.rowCount).toBe(0);
  });

  it('stores the canonical zone for an Apple alias, whoever writes it', async () => {
    const { actors } = harness.fixture;
    const id = randomUUID();
    await asUser(actors.member, (tx) =>
      tx.query(
        `INSERT INTO devices (id, user_id, platform, app_version, locale, tz)
         VALUES ($1, $2, 'ios', '1.0.0', 'vi', 'Asia/Saigon')`,
        [id, actors.member],
      ),
    );
    const { rows } = await withSystem(harness.db.pool, (tx) =>
      tx.query<{ tz: string }>('SELECT tz FROM devices WHERE id = $1', [id]),
    );
    expect(rows[0]?.tz).toBe('Asia/Ho_Chi_Minh');
  });

  it('rejects a device with an unknown time zone or platform', async () => {
    const { actors } = harness.fixture;
    await expect(
      asUser(actors.member, (tx) =>
        tx.query(
          `INSERT INTO devices (id, user_id, platform, app_version, locale, tz)
           VALUES ($1, $2, 'ios', '1.0.0', 'en', 'Mars/Olympus')`,
          [randomUUID(), actors.member],
        ),
      ),
    ).rejects.toThrow(/devices_tz_check/);
    await expect(
      asUser(actors.member, (tx) =>
        tx.query(
          `INSERT INTO devices (id, user_id, platform, app_version, locale, tz)
           VALUES ($1, $2, 'web', '1.0.0', 'en', 'UTC')`,
          [randomUUID(), actors.member],
        ),
      ),
    ).rejects.toThrow(/devices_platform_check/);
  });

  it('push tokens are written by the system only, unique per (kind, token)', async () => {
    const { actors } = harness.fixture;
    const id = await insertDevice(actors.member);
    await expect(
      asUser(actors.member, (tx) =>
        tx.query(
          "INSERT INTO push_tokens (device_id, kind, token, env) VALUES ($1, 'fcm', 'x', 'prod')",
          [id],
        ),
      ),
    ).rejects.toThrow(/permission denied/i);
    const token = `fcm-${randomUUID()}`;
    await withSystem(harness.db.pool, (tx) =>
      tx.query(
        "INSERT INTO push_tokens (device_id, kind, token, env) VALUES ($1, 'fcm', $2, 'prod')",
        [id, token],
      ),
    );
    await expect(
      withSystem(harness.db.pool, (tx) =>
        tx.query(
          "INSERT INTO push_tokens (device_id, kind, token, env) VALUES ($1, 'fcm', $2, 'prod')",
          [id, token],
        ),
      ),
    ).rejects.toThrow(/push_tokens_kind_token_key/);
  });

  it('notifications, ledger and roundups are system-written only', async () => {
    const { actors } = harness.fixture;
    await expect(
      asUser(actors.member, (tx) =>
        tx.query('INSERT INTO ping_ledger (user_id, local_date) VALUES ($1, CURRENT_DATE)', [
          actors.member,
        ]),
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      asUser(actors.organiser, (tx) =>
        tx.query("UPDATE notifications SET state = 'dropped' WHERE user_id = $1", [
          actors.organiser,
        ]),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('the owner may resolve an inbox item but not rewrite it', async () => {
    const { actors } = harness.fixture;
    const resolved = await asUser(actors.organiser, (tx) =>
      tx.query('UPDATE inbox_items SET resolved_at = now() WHERE user_id = $1', [actors.organiser]),
    );
    expect(resolved.rowCount).toBe(1);
    await expect(
      asUser(actors.organiser, (tx) =>
        tx.query('UPDATE inbox_items SET needs_you = true WHERE user_id = $1', [actors.organiser]),
      ),
    ).rejects.toThrow(/permission denied/i);
    const foreign = await asUser(actors.outsider, (tx) =>
      tx.query('UPDATE inbox_items SET resolved_at = now() WHERE user_id = $1', [actors.organiser]),
    );
    expect(foreign.rowCount).toBe(0);
  });

  it('starts a person on a daily budget of 10', async () => {
    const { actors } = harness.fixture;
    // A row of defaults, read and removed again: the outsider keeps no prefs for the other tests.
    const rows = await withSystem(harness.db.pool, async (tx) => {
      const created = await tx.query<{ budget_per_day: number }>(
        'INSERT INTO notification_prefs (user_id) VALUES ($1) RETURNING budget_per_day',
        [actors.outsider],
      );
      await tx.query('DELETE FROM notification_prefs WHERE user_id = $1', [actors.outsider]);
      return created.rows;
    });
    expect(rows).toEqual([{ budget_per_day: 10 }]);
  });

  it('keeps the daily budget within 1–10', async () => {
    const { actors } = harness.fixture;
    await expect(
      asUser(actors.organiser, (tx) =>
        tx.query('UPDATE notification_prefs SET budget_per_day = 11 WHERE user_id = $1', [
          actors.organiser,
        ]),
      ),
    ).rejects.toThrow(/notification_prefs_budget_check/);
  });
});

describe('me stream', () => {
  it('syncs each notification table to its owner only', async () => {
    const organiser = idsByTable(await harness.rows('me', 'organiser'));
    const outsider = idsByTable(await harness.rows('me', 'outsider'));
    for (const table of OWNER_TABLES) {
      expect(organiser[table]?.length ?? 0, `${table} for its owner`).toBeGreaterThan(0);
      expect(outsider[table] ?? [], `${table} for an outsider`).toEqual([]);
    }
  });

  it('never syncs push tokens', async () => {
    const organiser = await harness.rows('me', 'organiser');
    expect(organiser.has('push_tokens')).toBe(false);
  });
});
