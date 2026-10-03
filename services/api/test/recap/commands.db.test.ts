/**
 * Recap commands through the real `/v1/cmd` door against a migrated Postgres: the first open signs
 * every traveller's trip stamp and tells the recap's channel, a replay or a second open signs
 * nothing more; a crewmate who never travelled cannot open it; a signature drawn later fills the
 * stamps already signed; MVP votes change until everyone voted, which queues the close, and a
 * closed vote refuses; only an award's owner hides it, from everyone; a failed recap can be retried.
 */
import { withSystem } from '@cp/db';
import { generateUuidV7 } from '@cp/domain';
import type { PgBoss } from 'pg-boss';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerRecapCommands } from '../../src/commands/recap';
import { startJobProducer } from '../../src/jobs/producer';
import { runCommand } from '../location/location-fixture';
import {
  startCommandDoors,
  type CommandDoorsHarness,
  type SignedIn,
} from '../routes/command-doors-harness';

let harness: CommandDoorsHarness;
let producer: PgBoss;
let anna: SignedIn;
let ben: SignedIn;
let cora: SignedIn;
let homebody: SignedIn;
let tripId: string;
let recapId: string;
const awards: Record<string, string> = {};

async function q<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return withSystem(harness.pool, async (tx) => (await tx.query(sql, params)).rows as T[]);
}

async function one(sql: string, params: unknown[] = []): Promise<string> {
  return ((await q<{ id: string }>(sql, params))[0] as { id: string }).id;
}

async function outbox(type: string): Promise<Record<string, unknown>[]> {
  const { rows } = await harness.pool.query<{ payload: { data: Record<string, unknown> } }>(
    `SELECT payload FROM rt_outbox WHERE channel = $1 AND payload->>'type' = $2 ORDER BY id`,
    [`recap:${recapId}`, type],
  );
  return rows.map((row) => row.payload.data);
}

beforeAll(async () => {
  harness = await startCommandDoors(registerRecapCommands);
  const { connectionString } = (
    harness.pool as unknown as { options: { connectionString: string } }
  ).options;
  producer = await startJobProducer({ connectionString, logger: { error: () => undefined } });
  [anna, ben, cora, homebody] = await Promise.all([
    harness.signInAnonymously(),
    harness.signInAnonymously(),
    harness.signInAnonymously(),
    harness.signInAnonymously(),
  ]);
  const crewId = await one("INSERT INTO crews (name, created_by) VALUES ('Six', $1) RETURNING id", [
    anna.uid,
  ]);
  for (const person of [anna, ben, cora, homebody]) {
    await q('INSERT INTO crew_members (crew_id, user_id, role) VALUES ($1, $2, $3)', [
      crewId,
      person.uid,
      person === anna ? 'organiser' : 'member',
    ]);
  }
  tripId = await one(
    `INSERT INTO trips (crew_id, status, start_date, end_date)
     VALUES ($1, 'voting', '2026-10-02', '2026-10-04') RETURNING id`,
    [crewId],
  );
  for (const person of [anna, ben, cora]) {
    await q(
      "INSERT INTO trip_participants (trip_id, user_id, role, rsvp) VALUES ($1, $2, $3, 'in')",
      [tripId, person.uid, person === anna ? 'organiser' : 'member'],
    );
  }
  for (const status of [
    'won',
    'setup',
    'drafting',
    'draft_review',
    'proposed',
    'confirmed',
    'pre_trip',
    'in_trip',
    'post_trip',
  ]) {
    await q('UPDATE trips SET status = $2 WHERE id = $1', [tripId, status]);
  }
  recapId = await one(
    `INSERT INTO recaps (trip_id, crew_id, status, version, copy_version, ready_at,
       mvp_closes_at)
     VALUES ($1, $2, 'ready', 1, 1, now(), now() + interval '72 hours') RETURNING id`,
    [tripId, crewId],
  );
  for (const [person, kind] of [
    [anna, 'planner'],
    [ben, 'treasurer'],
    [cora, 'good_company'],
  ] as const) {
    await q('INSERT INTO recap_views (recap_id, trip_id, user_id) VALUES ($1, $2, $3)', [
      recapId,
      tripId,
      person.uid,
    ]);
    awards[person.uid] = await one(
      `INSERT INTO recap_awards (recap_id, trip_id, user_id, kind, metric, value)
       VALUES ($1, $2, $3, $4, 'plan_edits', 1) RETURNING id`,
      [recapId, tripId, person.uid, kind],
    );
  }
  // Anna and Ben hold issued passes with the trip's stamp; Cora has no pass yet.
  for (const person of [anna, ben]) {
    const pass = await one(
      `INSERT INTO passes (user_id, status, number, issued_at)
       VALUES ($1, 'issued', app.format_pass_number(nextval('pass_number_seq')), now()) RETURNING id`,
      [person.uid],
    );
    await q(
      `INSERT INTO stamps (pass_id, user_id, kind, seq_no, trip_id, status, stamped_at)
       VALUES ($1, $2, 'trip', 2, $3, 'stamped', now())`,
      [pass, person.uid, tripId],
    );
  }
}, 240_000);

afterAll(async () => {
  await producer?.stop({ graceful: false });
  await harness?.stop();
});

describe('record_recap_view', () => {
  it("signs every traveller's trip stamp on the first open, once, live on the recap channel", async () => {
    const opId = generateUuidV7();
    const first = await runCommand(
      harness,
      cora,
      'record_recap_view',
      { recap_id: recapId, kind: 'open' },
      { opId },
    );
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ result: { recap_id: recapId, signed: 2 } });
    const replay = await runCommand(
      harness,
      cora,
      'record_recap_view',
      { recap_id: recapId, kind: 'open' },
      { opId },
    );
    expect(replay.body).toMatchObject({ status: 'duplicate' });
    const again = await runCommand(harness, cora, 'record_recap_view', {
      recap_id: recapId,
      kind: 'complete',
    });
    expect(again.body).toMatchObject({ result: { signed: 0 } });

    const signatures = await q<{ owner: string; signer_id: string }>(
      `SELECT s.user_id AS owner, g.signer_id FROM stamp_signatures g JOIN stamps s ON s.id = g.stamp_id
        WHERE g.recap_id = $1 ORDER BY s.user_id`,
      [recapId],
    );
    expect(signatures).toEqual(
      [anna.uid, ben.uid].sort().map((owner) => ({ owner, signer_id: cora.uid })),
    );
    expect(await outbox('signature')).toEqual([
      expect.objectContaining({ signer_id: cora.uid, stroke_media_key: null }),
    ]);
    const [view] = await q<{ opened: boolean; completed: boolean }>(
      `SELECT opened_at IS NOT NULL AS opened, completed_at IS NOT NULL AS completed
         FROM recap_views WHERE recap_id = $1 AND user_id = $2`,
      [recapId, cora.uid],
    );
    expect(view).toEqual({ opened: true, completed: true });
  });

  it('is not found for a crewmate who never travelled', async () => {
    const result = await runCommand(harness, homebody, 'record_recap_view', {
      recap_id: recapId,
      kind: 'open',
    });
    expect(result.status).toBe(404);
  });
});

describe('save_signature', () => {
  it('fills the stamps already signed with the drawn stroke, and says so live', async () => {
    const key = `u/${cora.uid}/signature/${generateUuidV7()}`;
    const mediaId = await one(
      `INSERT INTO media_objects (owner_id, r2_key, kind, bytes, sha256, purpose)
       VALUES ($1, $2, 'application/json', 512, repeat('a', 64), 'signature') RETURNING id`,
      [cora.uid, key],
    );
    const foreign = await runCommand(harness, ben, 'save_signature', { media_id: mediaId });
    expect(foreign.status).toBe(404);
    const saved = await runCommand(harness, cora, 'save_signature', { media_id: mediaId });
    expect(saved.body).toMatchObject({ result: { media_key: key, stamps: 2 } });
    expect(
      await q('SELECT DISTINCT stroke_media_key FROM stamp_signatures WHERE signer_id = $1', [
        cora.uid,
      ]),
    ).toEqual([{ stroke_media_key: key }]);
    expect((await outbox('signature')).at(-1)).toMatchObject({ stroke_media_key: key });
  });
});

describe('opt_out_award', () => {
  it("hides only the caller's own award, for everyone", async () => {
    const foreign = await runCommand(harness, cora, 'opt_out_award', {
      award_id: awards[ben.uid],
    });
    expect(foreign.status).toBe(403);
    const own = await runCommand(harness, cora, 'opt_out_award', { award_id: awards[cora.uid] });
    expect(own.status).toBe(200);
    expect(await q('SELECT opted_out FROM recap_awards WHERE id = $1', [awards[cora.uid]])).toEqual(
      [{ opted_out: true }],
    );
  });
});

describe('cast_mvp_vote', () => {
  it('counts one changeable vote each, refuses a hidden award, and queues the close once all voted', async () => {
    const vote = (person: SignedIn, award: string | undefined) =>
      runCommand(harness, person, 'cast_mvp_vote', { recap_id: recapId, award_id: award });
    expect((await vote(anna, awards[cora.uid])).status).toBe(404);
    expect((await vote(anna, awards[ben.uid])).body).toMatchObject({ result: { closed: false } });
    expect((await vote(anna, awards[anna.uid])).body).toMatchObject({ result: { closed: false } });
    expect((await vote(ben, awards[anna.uid])).body).toMatchObject({ result: { closed: false } });
    expect((await vote(cora, awards[anna.uid])).body).toMatchObject({ result: { closed: true } });

    const tallies = await q<{ user_id: string; mvp_votes: number }>(
      'SELECT user_id, mvp_votes FROM recap_awards WHERE recap_id = $1 ORDER BY user_id',
      [recapId],
    );
    expect(Object.fromEntries(tallies.map((t) => [t.user_id, t.mvp_votes]))).toEqual({
      [anna.uid]: 3,
      [ben.uid]: 0,
      [cora.uid]: 0,
    });
    expect(await q('SELECT 1 FROM recap_mvp_votes WHERE recap_id = $1', [recapId])).toHaveLength(3);
    expect((await outbox('mvp.vote')).at(-1)).toMatchObject({ voters: 3, viewers: 3 });
    const { rows } = await harness.pool.query(
      "SELECT data FROM pgboss.job WHERE name = 'recap.mvp_close'",
    );
    expect(rows).toEqual([{ data: { recap_id: recapId } }]);

    await q('UPDATE recaps SET mvp_closed_at = now() WHERE id = $1', [recapId]);
    const late = await vote(ben, awards[ben.uid]);
    expect(late.body).toMatchObject({ error: { code: 'VOTE_CLOSED' } });
  });
});

describe('retry_recap', () => {
  it('queues a build for a failed recap, and refuses one that is ready', async () => {
    const ready = await runCommand(harness, ben, 'retry_recap', { trip_id: tripId });
    expect(ready.body).toMatchObject({ error: { code: 'STATE_INVALID' } });
    await q("UPDATE recaps SET status = 'failed' WHERE id = $1", [recapId]);
    const outsider = await runCommand(harness, homebody, 'retry_recap', { trip_id: tripId });
    expect(outsider.status).toBe(404);
    const retried = await runCommand(harness, ben, 'retry_recap', { trip_id: tripId });
    expect(retried.status).toBe(200);
    expect(await q('SELECT status FROM recaps WHERE id = $1', [recapId])).toEqual([
      { status: 'queued' },
    ]);
    const { rows } = await harness.pool.query(
      "SELECT data FROM pgboss.job WHERE name = 'recap.build'",
    );
    expect(rows).toEqual([{ data: { trip_id: tripId, reason: 'retry' } }]);
  });
});
