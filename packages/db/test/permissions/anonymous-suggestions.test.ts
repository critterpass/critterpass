/**
 * `anonymous_suggestions` (C1, RLS T): "Someone asked about cost", read by the crew, written only
 * by `app.write_anonymous_suggestion` from the caller's own private thread and only in a crew of
 * four or more. The same threshold guards `app.write_unattributed_changeset`, so a shared change
 * picked in a private objection never reaches a small crew whose timing would name the person.
 * No column links a suggestion back to its thread.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { withSystem, withUser } from '../../src/tx';
import { insertCrewMember, insertUser } from '../helpers/actors';
import { expectCrewReadOnly } from '../helpers/setup-privacy';
import { startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

let harness: StreamHarness;
let threadId: string;

const ops = JSON.stringify([
  { op: 'apply_crew_option', option_id: 'room:shared', kind: 'cheaper_room', delta_minor: '-4000' },
]);

beforeAll(async () => {
  harness = await startStreamHarness();
  const { tripId, versionId } = harness.fixture;
  threadId = await withSystem(harness.db.pool, async (tx) => {
    await tx.query(
      `UPDATE trips SET current_version_id = $2,
              guide_id = (SELECT id FROM guides WHERE slug = 'matrix-probe-guide') WHERE id = $1`,
      [tripId, versionId],
    );
    const { rows } = await tx.query<{ id: string }>(
      'SELECT id FROM private_guide_threads WHERE trip_id = $1',
      [tripId],
    );
    return rows[0]!.id;
  });
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

function asMember<T>(sql: string, params: unknown[]): Promise<T[]> {
  return withUser(harness.db.pool, harness.fixture.actors.member, randomUUID(), async (tx) => {
    const { rows } = await tx.query(sql, params);
    return rows as T[];
  });
}

describe('anonymous_suggestions', () => {
  it('is read by the crew only, synced on the trip stream and never written by app_user', async () => {
    await expectCrewReadOnly(harness, 'anonymous_suggestions');
  });

  it('has no column that points back at the private thread', async () => {
    const { rows } = await harness.db.pool.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'anonymous_suggestions'`,
    );
    expect(rows.map((row) => row.column_name).sort()).toEqual(
      ['created_at', 'id', 'proposal_id', 'text', 'topic', 'trip_id'].sort(),
    );
  });

  it('refuses both the suggestion and the unattributed change set in a crew of three', async () => {
    await expect(asMember('SELECT app.write_anonymous_suggestion($1)', [threadId])).rejects.toThrow(
      /crew too small/i,
    );
    await expect(
      asMember('SELECT app.write_unattributed_changeset($1, $2::jsonb, -4000)', [threadId, ops]),
    ).rejects.toThrow(/crew too small/i);
  });

  it('writes a nameless line once and an unattributed change set once the crew has four', async () => {
    const { actors, crewId, tripId } = harness.fixture;
    await withSystem(harness.db.pool, async (tx) => {
      const fourth = await insertUser(tx);
      await insertCrewMember(tx, { crewId, userId: fourth });
    });
    const [first] = await asMember<{ id: string }>(
      'SELECT app.write_anonymous_suggestion($1) AS id',
      [threadId],
    );
    const [again] = await asMember<{ id: string }>(
      'SELECT app.write_anonymous_suggestion($1) AS id',
      [threadId],
    );
    expect(again!.id).toBe(first!.id);
    const { rows } = await harness.db.pool.query<{ text: string }>(
      'SELECT text FROM anonymous_suggestions WHERE id = $1',
      [first!.id],
    );
    expect(rows[0]!.text).toBe('Someone asked about cost');
    const [change] = await asMember<{ id: string }>(
      'SELECT app.write_unattributed_changeset($1, $2::jsonb, -4000) AS id',
      [threadId, ops],
    );
    const made = await harness.db.pool.query<{ author_kind: string; author_id: string }>(
      'SELECT author_kind, author_id FROM change_sets WHERE id = $1 AND trip_id = $2',
      [change!.id, tripId],
    );
    expect(made.rows[0]!.author_kind).toBe('guide');
    expect(made.rows[0]!.author_id).not.toBe(actors.member);
  });

  it("refuses someone else's thread", async () => {
    const { actors } = harness.fixture;
    await expect(
      withUser(harness.db.pool, actors.organiser, randomUUID(), (tx) =>
        tx.query('SELECT app.write_anonymous_suggestion($1)', [threadId]),
      ),
    ).rejects.toThrow(/not your private thread/i);
  });
});
