/**
 * `moderation_reports` (docs/data-model.md §3.15, RLS class S): any user may file a report as
 * themselves, nobody reads reports back through app_user, and only the system (the ops console's
 * command pipeline) changes a report's status or verdict.
 */
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem, withUser } from '../../src/tx';
import { anonymousActor, insertUser, randomId } from '../helpers/actors';
import {
  startDbTestContainer,
  type DbTestContainer,
  type DbTestDatabase,
} from '../helpers/pg-container';

let container: DbTestContainer;
let db: DbTestDatabase;

beforeAll(async () => {
  container = await startDbTestContainer();
  db = await container.createDatabase();
}, 180_000);

afterAll(async () => {
  await db.drop();
  await container.stop();
});

const report = (reporter: string) => (tx: pg.PoolClient) =>
  tx.query(
    `INSERT INTO moderation_reports (reporter_id, target_kind, target_id, reason)
     VALUES ($1, 'user', $2, 'spam')`,
    [reporter, randomId()],
  );

describe('moderation_reports', () => {
  it('lets a reporter insert their own report only', async () => {
    const reporter = await withSystem(db.pool, (tx) => insertUser(tx));
    const other = await withSystem(db.pool, (tx) => insertUser(tx));
    const device = anonymousActor().device;

    await expect(withUser(db.pool, reporter, device, report(reporter))).resolves.toBeDefined();
    await expect(withUser(db.pool, reporter, device, report(other))).rejects.toThrow(
      /row-level security/i,
    );
  });

  it('never lets app_user read, update or pre-decide a report', async () => {
    const reporter = await withSystem(db.pool, (tx) => insertUser(tx));
    const device = anonymousActor().device;
    await withUser(db.pool, reporter, device, report(reporter));

    await expect(
      withUser(db.pool, reporter, device, (tx) => tx.query('SELECT 1 FROM moderation_reports')),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      withUser(db.pool, reporter, device, (tx) =>
        tx.query("UPDATE moderation_reports SET status = 'dismissed'"),
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      withUser(db.pool, reporter, device, (tx) =>
        tx.query(
          `INSERT INTO moderation_reports (reporter_id, target_kind, target_id, reason, status)
           VALUES ($1, 'user', $2, 'spam', 'actioned')`,
          [reporter, randomId()],
        ),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('lets the system decide a report and admin_reader read it', async () => {
    const reporter = await withSystem(db.pool, (tx) => insertUser(tx));
    await withUser(db.pool, reporter, anonymousActor().device, report(reporter));
    await withSystem(db.pool, (tx) =>
      tx.query(
        `UPDATE moderation_reports SET status = 'actioned', verdict = 'hide', decided_at = now()
         WHERE reporter_id = $1`,
        [reporter],
      ),
    );

    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE admin_reader');
      const { rows } = await client.query<{ status: string; verdict: string }>(
        'SELECT status, verdict FROM moderation_reports WHERE reporter_id = $1',
        [reporter],
      );
      expect(rows).toEqual([{ status: 'actioned', verdict: 'hide' }]);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });

  it('rejects an unknown status or a malformed subject kind', async () => {
    const reporter = await withSystem(db.pool, (tx) => insertUser(tx));
    await expect(
      withSystem(db.pool, (tx) =>
        tx.query(
          `INSERT INTO moderation_reports (reporter_id, target_kind, target_id, reason, status)
           VALUES ($1, 'user', $2, 'spam', 'escalated')`,
          [reporter, randomId()],
        ),
      ),
    ).rejects.toThrow(/check constraint/i);
    await expect(
      withSystem(db.pool, (tx) =>
        tx.query(
          `INSERT INTO moderation_reports (reporter_id, target_kind, target_id, reason)
           VALUES ($1, 'User Photo', $2, 'spam')`,
          [reporter, randomId()],
        ),
      ),
    ).rejects.toThrow(/check constraint/i);
  });
});
