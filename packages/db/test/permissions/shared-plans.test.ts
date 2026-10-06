/**
 * `shared_plans`: a plan waiting for consent is its crew's alone; once published every signed-in
 * reader sees it, but only through the projection columns: the trip, the requester and the consent
 * list are never granted to app_user, nobody writes a plan directly, and `plan_links` keep their
 * token hash from every client. Consents are each person's own: the crew never reads who declined.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem, withUser } from '../../src/tx';
import { visibleRows } from '../helpers/setup-privacy';
import { startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;
let planId: string;

beforeAll(async () => {
  harness = await startStreamHarness();
  const { actors, tripId } = harness.fixture;
  planId = await withSystem(harness.db.pool, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO shared_plans (trip_id, destination_id, requested_by, consent_required_uids)
       SELECT id, (SELECT destination_id FROM pois WHERE name = 'Matrix Probe POI'), $2::uuid,
              ARRAY[$2, $3]::uuid[] FROM trips WHERE id = $1 RETURNING id`,
      [tripId, actors.organiser, actors.member],
    );
    const id = rows[0]!.id;
    await tx.query(
      `INSERT INTO shared_plan_consents (shared_plan_id, user_id, decision, decided_at)
       VALUES ($1, $2, 'approved', now()), ($1, $3, 'declined', now())`,
      [id, actors.organiser, actors.member],
    );
    await tx.query(
      `INSERT INTO plan_links (trip_id, shared_plan_id, token_hash) VALUES ($1, $2, repeat('a', 64))`,
      [tripId, id],
    );
    return id;
  });
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

const READ = 'SELECT id, projection FROM shared_plans WHERE id = $1';

describe('shared_plans', () => {
  it('keeps a plan waiting for consent inside the crew', async () => {
    const { actors } = harness.fixture;
    expect(await visibleRows(harness, actors.member, READ, [planId])).toBe(1);
    expect(await visibleRows(harness, actors.outsider, READ, [planId])).toBe(0);
    expect(await visibleRows(harness, actors.exMember, READ, [planId])).toBe(0);
  });

  it('opens a published plan to every reader through its projection only', async () => {
    await withSystem(harness.db.pool, (tx) =>
      tx.query("UPDATE shared_plans SET status = 'published', published_at = now() WHERE id = $1", [
        planId,
      ]),
    );
    expect(await visibleRows(harness, harness.fixture.actors.outsider, READ, [planId])).toBe(1);
    for (const column of ['trip_id', 'requested_by', 'consent_required_uids']) {
      await expect(
        withUser(harness.db.pool, harness.fixture.actors.outsider, randomUUID(), (tx) =>
          tx.query(`SELECT ${column} FROM shared_plans`),
        ),
        column,
      ).rejects.toThrow(/permission denied/i);
    }
  });

  it('is written by the server only', async () => {
    await expect(
      withUser(harness.db.pool, harness.fixture.actors.organiser, randomUUID(), (tx) =>
        tx.query("UPDATE shared_plans SET status = 'unpublished' WHERE id = $1", [planId]),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('shows each person only their own consent answer', async () => {
    const { actors } = harness.fixture;
    const sql = 'SELECT user_id, decision FROM shared_plan_consents WHERE shared_plan_id = $1';
    expect(await visibleRows(harness, actors.organiser, sql, [planId])).toBe(1);
    expect(await visibleRows(harness, actors.member, sql, [planId])).toBe(1);
    expect(await visibleRows(harness, actors.coOrganiser, sql, [planId])).toBe(0);
  });

  it('never lets a client read a link token hash', async () => {
    const { actors } = harness.fixture;
    expect(await visibleRows(harness, actors.member, 'SELECT id FROM plan_links')).toBe(1);
    expect(await visibleRows(harness, actors.outsider, 'SELECT id FROM plan_links')).toBe(0);
    await expect(
      withUser(harness.db.pool, actors.organiser, randomUUID(), (tx) =>
        tx.query('SELECT token_hash FROM plan_links'),
      ),
    ).rejects.toThrow(/permission denied/i);
  });
});
