/**
 * `payments` (C1, RLS M): the crew reads its payments through `crews`, a member who left reads the
 * ones that name them, and only the settle-up commands write, as the server.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem, withUser } from '../../src/tx';
import { startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;

beforeAll(async () => {
  harness = await startStreamHarness();
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

describe('payments', () => {
  it('shows a former member the payments that name them, and only those', async () => {
    const { actors, crewId } = harness.fixture;
    await withSystem(harness.db.pool, (tx) =>
      tx.query(
        `INSERT INTO payments (crew_id, from_id, to_id, amount_minor, currency, created_by)
         VALUES ($1, $2, $3, 1250, 'USD', $3)`,
        [crewId, actors.exMember, actors.organiser],
      ),
    );
    const { rows } = await withUser(harness.db.pool, actors.exMember, randomUUID(), (tx) =>
      tx.query('SELECT from_id FROM payments'),
    );
    expect(rows).toEqual([{ from_id: actors.exMember }]);
  });
});
