import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem, withUser } from '../../src/tx';
import { anonymousActor, firstRow, insertUser } from '../helpers/actors';
import {
  startDbTestContainer,
  type DbTestContainer,
  type DbTestDatabase,
} from '../helpers/pg-container';

const TABLES = ['fsq_os_export_runs', 'fsq_os_export_chunks', 'fsq_os_export_rows'];

let container: DbTestContainer;
let db: DbTestDatabase;
let uid: string;

beforeAll(async () => {
  container = await startDbTestContainer();
  db = await container.createDatabase();
  uid = await insertUser(db.pool);
}, 180_000);

afterAll(async () => {
  await db.drop();
  await container.stop();
});

describe('FSQ OS export staging RLS: server-only (class S)', () => {
  it('lets app_system write a run and keeps every table from app_user', async () => {
    await withSystem(db.pool, async (tx) => {
      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO fsq_os_export_runs (targets, chunk_count) VALUES ('[]', 1) RETURNING id`,
      );
      const runId = firstRow(rows).id;
      await tx.query(
        "INSERT INTO fsq_os_export_chunks (run_id, chunk, files) VALUES ($1, 0, '{a.parquet}')",
        [runId],
      );
      await tx.query(
        `INSERT INTO fsq_os_export_rows (run_id, slug, fsq_place_id, name, lat, lng)
         VALUES ($1, 'kyoto', 'f-1', 'Nishiki Market', 35.005, 135.765)`,
        [runId],
      );
    });
    for (const table of TABLES) {
      await expect(
        withUser(db.pool, uid, anonymousActor().device, (tx) =>
          tx.query(`SELECT 1 FROM ${table} LIMIT 1`),
        ),
      ).rejects.toThrow(/permission denied/i);
    }
  });

  it('removes a run with its chunks and rows', async () => {
    await withSystem(db.pool, (tx) => tx.query('DELETE FROM fsq_os_export_runs'));
    const { rows } = await db.pool.query<{ n: string }>(
      'SELECT (SELECT count(*) FROM fsq_os_export_chunks) + (SELECT count(*) FROM fsq_os_export_rows) AS n',
    );
    expect(Number(firstRow(rows).n)).toBe(0);
  });

  it('never enters the powersync publication', async () => {
    const { rows } = await db.pool.query(
      `SELECT 1 FROM pg_publication_tables WHERE pubname = 'powersync' AND tablename = ANY($1)`,
      [TABLES],
    );
    expect(rows).toEqual([]);
  });
});
