/**
 * `insurance_policies` (C3, RLS X) and the consented share: a member's policy is theirs alone (no
 * peer, guide_reader, publication or stream sees it) and its number and assistance line are sealed
 * even from them through app_user. Sharing it with a help session needs a standing
 * `insurance_to_clinic` consent; the approved share records the text shown, and the ops desk's
 * read of it is audited. Nobody but the system role reads a share.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem, withUser } from '../../src/tx';
import { expectSealed } from '../helpers/setup-privacy';
import { startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;
const helpSession = randomUUID();
const TEXT = 'Chubb Travel · policy number · assistance line';

beforeAll(async () => {
  harness = await startStreamHarness();
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

async function share(uid: string): Promise<unknown[]> {
  const { rows } = await withUser(harness.db.pool, uid, randomUUID(), (tx) =>
    tx.query<{ approval_id: string }>(
      'SELECT approval_id, policy_id FROM app.share_insurance($1, $2)',
      [helpSession, TEXT],
    ),
  );
  return rows;
}

async function approvals(): Promise<number> {
  const { rows } = await harness.db.pool.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM ops.approvals
      WHERE subject_kind = 'insurance_share' AND subject_id = $1`,
    [helpSession],
  );
  return rows[0]!.n;
}

describe('insurance policies', () => {
  it('is readable by its owner only, and by no role, publication or stream', async () => {
    await expectSealed(harness, 'insurance_policies', { owner: 'organiser' });
  });

  it('never selects the number or the assistance line through app_user', async () => {
    const { actors } = harness.fixture;
    for (const column of ['policy_no_enc', 'assistance_phone_enc']) {
      await expect(
        withUser(harness.db.pool, actors.organiser, randomUUID(), (tx) =>
          tx.query(`SELECT ${column} FROM insurance_policies`),
        ),
        column,
      ).rejects.toThrow(/permission denied/i);
    }
  });

  it('shares nothing without the owner’s consent', async () => {
    const { actors } = harness.fixture;
    expect(await share(actors.organiser)).toEqual([]);
    expect(await share(actors.member)).toEqual([]);
    expect(await approvals()).toBe(0);
  });

  it('records a consented share and gives ops an audited read of it', async () => {
    const { actors } = harness.fixture;
    await withSystem(harness.db.pool, (tx) =>
      tx.query(
        `INSERT INTO consents (user_id, purpose, granted_at) VALUES ($1, 'insurance_to_clinic', now())
         ON CONFLICT (user_id, purpose) DO UPDATE SET granted_at = now(), revoked_at = NULL`,
        [actors.organiser],
      ),
    );
    expect(await share(actors.organiser)).toHaveLength(1);
    expect(await approvals()).toBe(1);
    const viewer = actors.coOrganiser;
    const { rows } = await withSystem(harness.db.pool, (tx) =>
      tx.query<{ user_id: string; provider: string; policy_no_enc: string }>(
        'SELECT user_id, provider, policy_no_enc FROM app.shared_insurance($1, $2)',
        [helpSession, viewer],
      ),
    );
    expect(rows).toEqual([
      { user_id: actors.organiser, provider: 'Chubb Travel', policy_no_enc: 'v1:matrix-probe' },
    ]);
    const audit = await harness.db.pool.query(
      "SELECT 1 FROM ops.reveal_audit WHERE kind = 'insurance' AND owner_id = $1 AND viewer_id = $2",
      [actors.organiser, viewer],
    );
    expect(audit.rowCount).toBe(1);
    await expect(
      withUser(harness.db.pool, actors.organiser, randomUUID(), (tx) =>
        tx.query('SELECT * FROM app.shared_insurance($1, $2)', [helpSession, viewer]),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('stops the ops read once the consent is withdrawn', async () => {
    const { actors } = harness.fixture;
    await withSystem(harness.db.pool, (tx) =>
      tx.query(
        "UPDATE consents SET revoked_at = now() WHERE user_id = $1 AND purpose = 'insurance_to_clinic'",
        [actors.organiser],
      ),
    );
    const { rows } = await withSystem(harness.db.pool, (tx) =>
      tx.query('SELECT 1 FROM app.shared_insurance($1, $2)', [helpSession, actors.coOrganiser]),
    );
    expect(rows).toEqual([]);
  });
});
