/**
 * `budget_defaults_private` (C3, RLS X): a member's default max is theirs alone, never shown to
 * anyone else, guides included.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withUser } from '../../src/tx';
import { startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;

beforeAll(async () => {
  harness = await startStreamHarness();
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

const as = (uid: string, sql: string, params: unknown[] = []) =>
  withUser(harness.db.pool, uid, randomUUID(), (tx) => tx.query(sql, params));

describe('budget_defaults_private', () => {
  it('lets a member write only their own default', async () => {
    const { member, organiser } = harness.fixture.actors;
    await expect(
      as(
        member,
        "INSERT INTO budget_defaults_private (user_id, amount_minor, currency) VALUES ($1, 1, 'USD')",
        [organiser],
      ),
    ).rejects.toThrow(/row-level security/i);
    const changed = await as(
      member,
      'UPDATE budget_defaults_private SET amount_minor = 1 WHERE user_id = $1',
      [organiser],
    );
    expect(changed.rowCount).toBe(0);
    await as(
      member,
      "INSERT INTO budget_defaults_private (user_id, amount_minor, currency) VALUES ($1, 80000, 'EUR')",
      [member],
    );
  });
});
