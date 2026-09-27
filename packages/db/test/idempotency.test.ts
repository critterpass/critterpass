/**
 * `claimOpId`/`recordCmdResult` (packages/db/src/events.ts, backed by `app.claim_op`/
 * `app.record_cmd_result`): the `cmd_log`/`cmd_results` idempotency contract (docs/api-contracts.md
 * §2.3 step 3).
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { claimOpId, recordCmdResult } from '../src/events';
import { withUser } from '../src/tx';
import { anonymousActor, insertUser } from './helpers/actors';
import {
  startDbTestContainer,
  type DbTestContainer,
  type DbTestDatabase,
} from './helpers/pg-container';

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

describe('claimOpId / recordCmdResult', () => {
  it('reports new on the first claim', async () => {
    const opId = randomUUID();
    const result = await withUser(db.pool, uid, anonymousActor().device, (tx) =>
      claimOpId(tx, { opId, uid, cmd: 'cast_ballot', payloadHash: 'hash-a' }),
    );
    expect(result).toEqual({ outcome: 'new' });
  });

  it('reports duplicate with the stored result on a same-hash replay', async () => {
    const opId = randomUUID();
    await withUser(db.pool, uid, anonymousActor().device, async (tx) => {
      const first = await claimOpId(tx, { opId, uid, cmd: 'cast_ballot', payloadHash: 'hash-b' });
      expect(first).toEqual({ outcome: 'new' });
      await recordCmdResult(tx, {
        opId,
        uid,
        cmd: 'cast_ballot',
        status: 'applied',
        resultRef: { option_id: 'opt-1' },
      });
    });

    const replay = await withUser(db.pool, uid, anonymousActor().device, (tx) =>
      claimOpId(tx, { opId, uid, cmd: 'cast_ballot', payloadHash: 'hash-b' }),
    );
    expect(replay).toMatchObject({
      outcome: 'duplicate',
      result: { status: 'applied', result_ref: { option_id: 'opt-1' } },
    });
  });

  it('reports mismatch when the same op_id carries a different payload hash', async () => {
    const opId = randomUUID();
    await withUser(db.pool, uid, anonymousActor().device, (tx) =>
      claimOpId(tx, { opId, uid, cmd: 'cast_ballot', payloadHash: 'hash-c' }),
    );

    const result = await withUser(db.pool, uid, anonymousActor().device, (tx) =>
      claimOpId(tx, { opId, uid, cmd: 'cast_ballot', payloadHash: 'hash-d' }),
    );
    expect(result).toEqual({ outcome: 'mismatch' });
  });

  it('lets app_user read only their own cmd_results row', async () => {
    const opId = randomUUID();
    const other = await insertUser(db.pool);
    await withUser(db.pool, uid, anonymousActor().device, async (tx) => {
      await claimOpId(tx, { opId, uid, cmd: 'cast_ballot', payloadHash: 'hash-e' });
      await recordCmdResult(tx, { opId, uid, cmd: 'cast_ballot', status: 'applied' });
    });

    const ownRows = await withUser(db.pool, uid, anonymousActor().device, async (tx) => {
      const { rows } = await tx.query<{ op_id: string }>(
        'SELECT op_id FROM cmd_results WHERE op_id = $1',
        [opId],
      );
      return rows;
    });
    expect(ownRows).toHaveLength(1);

    const otherRows = await withUser(db.pool, other, anonymousActor().device, async (tx) => {
      const { rows } = await tx.query<{ op_id: string }>(
        'SELECT op_id FROM cmd_results WHERE op_id = $1',
        [opId],
      );
      return rows;
    });
    expect(otherRows).toHaveLength(0);
  });
});
