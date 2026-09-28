/**
 * Console capture tables and columns (docs/data-model.md §3.15, §3.16): `ops.work_claims` is
 * written by app_system, read by admin_reader and unreachable for app_user; the moderation intake
 * columns are system-written and admin_reader-readable; a pipeline-published audit context fills a
 * self-written audit row on insert.
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

async function asRole<T>(role: string, fn: (tx: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL ROLE ${role}`);
    return await fn(client);
  } finally {
    await client.query('ROLLBACK').catch(() => undefined);
    client.release();
  }
}

describe('ops.work_claims', () => {
  it('holds one claim per item, written by app_system and read by admin_reader', async () => {
    const item = randomId();
    const admin = randomId();
    await withSystem(db.pool, (tx) =>
      tx.query("INSERT INTO ops.work_claims (queue, item_id, admin_id) VALUES ('desk', $1, $2)", [
        item,
        admin,
      ]),
    );
    await expect(
      withSystem(db.pool, (tx) =>
        tx.query("INSERT INTO ops.work_claims (queue, item_id, admin_id) VALUES ('desk', $1, $2)", [
          item,
          randomId(),
        ]),
      ),
    ).rejects.toThrow(/duplicate key/i);
    const read = await asRole('admin_reader', (tx) =>
      tx.query<{ admin_id: string }>('SELECT admin_id FROM ops.work_claims WHERE item_id = $1', [
        item,
      ]),
    );
    expect(read.rows).toEqual([{ admin_id: admin }]);
    await expect(
      asRole('admin_reader', (tx) => tx.query('DELETE FROM ops.work_claims')),
    ).rejects.toThrow(/permission denied/i);
  });

  it('is unreachable for app_user and rejects a malformed queue name', async () => {
    const uid = await withSystem(db.pool, (tx) => insertUser(tx));
    await expect(
      withUser(db.pool, uid, anonymousActor().device, (tx) =>
        tx.query('SELECT 1 FROM ops.work_claims'),
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      withSystem(db.pool, (tx) =>
        tx.query(
          "INSERT INTO ops.work_claims (queue, item_id, admin_id) VALUES ('Desk Tasks', $1, $2)",
          [randomId(), randomId()],
        ),
      ),
    ).rejects.toThrow(/check constraint/i);
  });
});

describe('moderation intake columns', () => {
  it('are written by app_system, readable by admin_reader and not insertable by app_user', async () => {
    const reporter = await withSystem(db.pool, (tx) => insertUser(tx));
    const author = randomId();
    const { rows } = await withSystem(db.pool, (tx) =>
      tx.query<{ id: string }>(
        `INSERT INTO moderation_reports (reporter_id, target_kind, target_id, reason, author_id,
           due_at, reason_counts)
         VALUES ($1, 'user', $2, 'spam', $2, now() + interval '24 hours', '{"spam": 1}')
         RETURNING id`,
        [reporter, author],
      ),
    );
    const reportId = rows[0]?.id ?? '';
    await withSystem(db.pool, (tx) =>
      tx.query(
        `INSERT INTO ops.moderation_filings (report_id, reporter_id, reason, note)
         VALUES ($1, $2, 'spam', 'Posted the same link ten times')`,
        [reportId, reporter],
      ),
    );
    const read = await asRole('admin_reader', (tx) =>
      tx.query(
        `SELECT r.author_id, r.reason_counts, r.assignee_admin_id, f.note
         FROM moderation_reports r JOIN ops.moderation_filings f ON f.report_id = r.id
         WHERE r.id = $1`,
        [reportId],
      ),
    );
    expect(read.rows).toEqual([
      {
        author_id: author,
        reason_counts: { spam: 1 },
        assignee_admin_id: null,
        note: 'Posted the same link ten times',
      },
    ]);
    await expect(
      withUser(db.pool, reporter, anonymousActor().device, (tx) =>
        tx.query(
          `INSERT INTO moderation_reports (reporter_id, target_kind, target_id, reason, author_id)
           VALUES ($1, 'user', $2, 'spam', $2)`,
          [reporter, randomId()],
        ),
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      withSystem(db.pool, (tx) =>
        tx.query(
          `INSERT INTO ops.moderation_filings (report_id, reporter_id, reason, note)
           VALUES ($1, $2, 'spam', $3)`,
          [reportId, randomId(), 'x'.repeat(281)],
        ),
      ),
    ).rejects.toThrow(/check constraint|foreign key/i);
  });
});

describe('ops.admin_audit context', () => {
  it('fills op_id, detail and ip hash on a self-written row from the published context', async () => {
    const opId = randomId();
    const admin = randomId();
    const target = randomId();
    const { rows } = await withSystem(db.pool, async (tx) => {
      await tx.query("SELECT set_config('app.admin_audit_context', $1, true)", [
        JSON.stringify({
          op_id: opId,
          ip_hash: 'abc',
          detail: { summary: 'Upsert poi', changes: [], via: 'admin', roles: ['content'] },
        }),
      ]);
      await tx.query(
        "INSERT INTO ops.admin_audit (admin_id, action, target_kind, target_id) VALUES ($1, 'upsert_poi', 'poi', $2)",
        [admin, target],
      );
      return tx.query<{ op_id: string; ip_hash: string; detail: Record<string, unknown> }>(
        'SELECT op_id, ip_hash, detail FROM ops.admin_audit WHERE admin_id = $1',
        [admin],
      );
    });
    expect(rows).toEqual([
      {
        op_id: opId,
        ip_hash: 'abc',
        detail: {
          summary: `Upsert poi · ${target}`,
          changes: [],
          via: 'admin',
          roles: ['content'],
        },
      },
    ]);
  });
});
