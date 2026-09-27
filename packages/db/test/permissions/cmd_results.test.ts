import { ERROR_CODES } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { claimOpId, recordCmdResult } from '../../src/events';
import { withUser } from '../../src/tx';
import { anonymousActor, insertUser } from '../helpers/actors';
import {
  startDbTestContainer,
  type DbTestContainer,
  type DbTestDatabase,
} from '../helpers/pg-container';

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

describe('cmd_results RLS: O (owner read-only)', () => {
  it('rejects a direct app_user insert — app.record_cmd_result is the only write path', async () => {
    await expect(
      withUser(db.pool, uid, anonymousActor().device, async (tx) => {
        await tx.query(
          "INSERT INTO cmd_results (op_id, uid, cmd, status) VALUES (gen_random_uuid(), $1, 'x', 'applied')",
          [uid],
        );
      }),
    ).rejects.toThrow(/permission denied/i);
  });

  it('accepts every documented error code, and rejects one outside the vocabulary', async () => {
    const validOpId = crypto.randomUUID();
    await withUser(db.pool, uid, anonymousActor().device, async (tx) => {
      await claimOpId(tx, { opId: validOpId, uid, cmd: 'x', payloadHash: 'h1' });
      await recordCmdResult(tx, {
        opId: validOpId,
        uid,
        cmd: 'x',
        status: 'rejected',
        code: 'VOTE_CLOSED',
      });
    });

    const invalidOpId = crypto.randomUUID();
    await expect(
      withUser(db.pool, uid, anonymousActor().device, async (tx) => {
        await claimOpId(tx, { opId: invalidOpId, uid, cmd: 'x', payloadHash: 'h2' });
        await recordCmdResult(tx, {
          opId: invalidOpId,
          uid,
          cmd: 'x',
          status: 'rejected',
          code: 'NOT_A_CODE',
        });
      }),
    ).rejects.toThrow(/violates check constraint/i);
  });
});

describe('cmd_results_code_check stays in sync with packages/domain/src/errors.ts', () => {
  it('lists exactly the same codes as ERROR_CODES', async () => {
    const { rows } = await db.pool.query<{ def: string }>(
      "SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conname = 'cmd_results_code_check'",
    );
    const def = rows[0]?.def ?? '';
    const codesInSql = [...def.matchAll(/'([A-Z_]+)'::text/g)].map((m) => m[1]);
    expect(new Set(codesInSql)).toEqual(new Set(ERROR_CODES));
  });
});
