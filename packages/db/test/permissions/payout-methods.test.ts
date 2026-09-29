/**
 * `payout_methods` (C3, RLS X) and `app.reveal_payout`: a member's payout details are theirs
 * alone (no peer, organiser, guide_reader, publication or stream sees them), and the only
 * disclosure is the reveal to the payer of an open payment to them, which is audited. The payee,
 * a crewmate who is not paying, and the payer of a confirmed payment all get nothing, unaudited.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem, withUser } from '../../src/tx';
import { expectSealed } from '../helpers/setup-privacy';
import { startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;
let paymentId: string;

beforeAll(async () => {
  harness = await startStreamHarness();
  const { rows } = await harness.db.pool.query<{ id: string }>(
    'SELECT id FROM payments WHERE crew_id = $1 AND status = $2',
    [harness.fixture.crewId, 'requested'],
  );
  paymentId = rows[0]!.id;
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

async function reveal(uid: string): Promise<unknown[]> {
  const { rows } = await withUser(harness.db.pool, uid, randomUUID(), (tx) =>
    tx.query<{ kind: string; details_enc: string }>(
      'SELECT kind, details_enc FROM app.reveal_payout($1)',
      [paymentId],
    ),
  );
  return rows;
}

async function auditCount(): Promise<number> {
  const { rows } = await harness.db.pool.query<{ n: number }>(
    'SELECT count(*)::int AS n FROM ops.reveal_audit WHERE subject_id = $1',
    [paymentId],
  );
  return rows[0]!.n;
}

describe('payout methods', () => {
  it('is readable by its owner only, and by no role, publication or stream', async () => {
    await expectSealed(harness, 'payout_methods', { owner: 'organiser' });
  });

  it('never lets a member write another member’s method', async () => {
    const { actors } = harness.fixture;
    const changed = await withUser(harness.db.pool, actors.member, randomUUID(), (tx) =>
      tx.query("UPDATE payout_methods SET label = 'mine' WHERE user_id = $1", [actors.organiser]),
    );
    expect(changed.rowCount).toBe(0);
    await expect(
      withUser(harness.db.pool, actors.member, randomUUID(), (tx) =>
        tx.query(
          "INSERT INTO payout_methods (user_id, kind, details_enc) VALUES ($1, 'bank', 'x')",
          [actors.organiser],
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('reveals the payee’s methods to the payer of an open payment, audited', async () => {
    const { actors } = harness.fixture;
    expect(await reveal(actors.member)).toEqual([
      { kind: 'paynow', details_enc: 'v1:matrix-probe' },
    ]);
    expect(await auditCount()).toBe(1);
  });

  it('reveals nothing to anyone else, and audits nothing', async () => {
    const { actors } = harness.fixture;
    for (const kind of ['organiser', 'coOrganiser', 'outsider', 'exMember', 'anonymous'] as const) {
      expect(await reveal(actors[kind]), kind).toEqual([]);
    }
    expect(await auditCount()).toBe(1);
  });

  it('closes the reveal once the payment is confirmed', async () => {
    const { actors } = harness.fixture;
    await withSystem(harness.db.pool, (tx) =>
      tx.query("UPDATE payments SET status = 'confirmed', confirmed_at = now() WHERE id = $1", [
        paymentId,
      ]),
    );
    expect(await reveal(actors.member)).toEqual([]);
    expect(await auditCount()).toBe(1);
  });
});
