/**
 * Proposal commands against a migrated Postgres through `/v1/cmd` and the objection stream:
 * reply-by bounds (never after the earliest free cancellation, never in the past, never moved by
 * a twenty-minute Viator hold), replays that create nothing twice, the seat cap under the trip's
 * row lock (the seventh IN waitlists with SEAT_CAP_REACHED), opens that never name the opener,
 * private reasons the organiser only sees as MAYBE, and declines that queue the re-split once.
 */
import { withSystem } from '@cp/db';
import { generateUuidV7 } from '@cp/domain';
import type { PgBoss } from 'pg-boss';
import pino from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerProposalCommands } from '../../../src/commands/proposal';
import { startJobProducer } from '../../../src/jobs/producer';
import { registerProposalRoutes } from '../../../src/routes/proposals';
import {
  envelope,
  startCommandDoors,
  type CommandDoorsHarness,
  type SignedIn,
} from '../../routes/command-doors-harness';
import { seedProposalTrip, type ProposalFixture } from './fixture';

interface CommandBody {
  readonly status?: string;
  readonly result: Record<string, unknown> & {
    proposal_id: string;
    reply_by: string;
    recipients: number;
  };
  readonly error: { code: string; detail: Record<string, unknown> };
}

let harness: CommandDoorsHarness;
let boss: PgBoss;
let organiser: SignedIn;
let members: SignedIn[];
let fx: ProposalFixture;
let proposalId: string;

const m = (n: number) => members[n - 1]!;

async function q<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return withSystem(harness.pool, async (tx) => (await tx.query(sql, params)).rows as T[]);
}

async function run(who: SignedIn, cmd: string, payload: unknown, opId = generateUuidV7()) {
  const response = await harness.request(`/v1/cmd/${cmd}`, {
    method: 'POST',
    headers: { cookie: who.cookie },
    body: JSON.stringify(
      envelope(cmd, payload, { op_id: opId, actor: { uid: who.uid, via: 'app' } }),
    ),
  });
  return { status: response.status, body: (await response.json()) as CommandBody };
}

const outboxSince = (since: string) =>
  q<{ channel: string; payload: unknown }>(
    'SELECT channel, payload FROM rt_outbox WHERE created_at >= $1::timestamptz ORDER BY id',
    [since],
  );
const eventsSince = async (since: string) =>
  (
    await harness.pool.query<{ type: string; actor_id: string | null; payload: unknown }>(
      `SELECT type, actor_id, payload FROM domain_events WHERE occurred_at >= $1::timestamptz
        ORDER BY occurred_at, id`,
      [since],
    )
  ).rows;
const now = async () => (await q<{ at: string }>('SELECT clock_timestamp()::text AS at'))[0]!.at;

beforeAll(async () => {
  harness = await startCommandDoors(registerProposalCommands, (app, deps) =>
    registerProposalRoutes(app, deps),
  );
  boss = await startJobProducer({
    connectionString: (harness.pool.options as { connectionString: string }).connectionString,
    logger: pino({ level: 'silent' }),
    startAttempts: 5,
  });
  organiser = await harness.signInAnonymously();
  members = [];
  for (let i = 0; i < 7; i += 1) members.push(await harness.signInAnonymously());
  fx = await seedProposalTrip(harness.pool, organiser, members);
});

afterAll(async () => {
  await boss?.stop({ graceful: false });
  await harness?.stop();
});

describe('create_proposal', () => {
  it('refuses a reply-by after the earliest free cancellation, and one in the past', async () => {
    const late = new Date(fx.freeCancelUntil.getTime() + 86_400_000).toISOString();
    const after = await run(organiser, 'create_proposal', {
      trip_id: fx.tripId,
      config: { reply_by: late },
    });
    expect(after.status).toBe(422);
    expect(after.body.error.detail).toMatchObject({ reason: 'after_free_cancel' });
    const past = await run(organiser, 'create_proposal', {
      trip_id: fx.tripId,
      config: { reply_by: new Date(Date.now() - 60_000).toISOString() },
    });
    expect(past.body.error.detail).toMatchObject({ reason: 'in_past' });
  });

  it('defaults reply-by to a day before free cancellation, untouched by a 20-minute hold', async () => {
    const opId = generateUuidV7();
    const created = await run(
      organiser,
      'create_proposal',
      { trip_id: fx.tripId, config: {} },
      opId,
    );
    expect(created.status).toBe(200);
    proposalId = created.body.result.proposal_id;
    const replyBy = new Date(created.body.result.reply_by).getTime();
    expect(replyBy).toBe(fx.freeCancelUntil.getTime() - 86_400_000);
    expect(replyBy).toBeGreaterThan(Date.now() + 3_600_000);
    expect(created.body.result.recipients).toBe(7);

    const replay = await run(
      organiser,
      'create_proposal',
      { trip_id: fx.tripId, config: {} },
      opId,
    );
    expect(replay.body.status).toBe('duplicate');
    const [counts] = await q<{ proposals: number; versions: number; jobs: number }>(
      `SELECT (SELECT count(*)::int FROM proposals WHERE trip_id = $1) AS proposals,
              (SELECT count(*)::int FROM proposal_versions WHERE trip_id = $1) AS versions,
              (SELECT count(*)::int FROM pgboss.job WHERE name = 'ai.proposal_versions') AS jobs`,
      [fx.tripId],
    );
    expect(counts).toEqual({ proposals: 1, versions: 7, jobs: 7 });
  });

  it('is organiser-only', async () => {
    const denied = await run(m(1), 'create_proposal', { trip_id: fx.tripId, config: {} });
    expect(denied.status).toBe(403);
  });
});

describe('send and reply', () => {
  it('sends once and moves the trip to proposed', async () => {
    expect((await run(organiser, 'send_proposal', { proposal_id: proposalId })).status).toBe(200);
    const [trip] = await q<{ status: string }>('SELECT status FROM trips WHERE id = $1', [
      fx.tripId,
    ]);
    expect(trip!.status).toBe('proposed');
  });

  it('seats IN up to the cap of six, then waitlists with SEAT_CAP_REACHED; a replay adds nothing', async () => {
    const fifth = await run(m(5), 'set_rsvp', { proposal_id: proposalId, status: 'in' });
    expect(fifth.body.result).toMatchObject({ rsvp: 'in', waitlisted: false });
    const opId = generateUuidV7();
    const seventh = await run(m(6), 'set_rsvp', { proposal_id: proposalId, status: 'in' }, opId);
    expect(seventh.status).toBe(200);
    expect(seventh.body.result).toMatchObject({
      rsvp: 'waitlisted',
      waitlisted: true,
      code: 'SEAT_CAP_REACHED',
      cap: 6,
      waitlist_position: 1,
    });
    const replay = await run(m(6), 'set_rsvp', { proposal_id: proposalId, status: 'in' }, opId);
    expect(replay.body.status).toBe('duplicate');
    const rows = await q<{ rsvp: string }>(
      'SELECT rsvp FROM trip_participants WHERE trip_id = $1 AND user_id = $2',
      [fx.tripId, m(6).uid],
    );
    expect(rows).toEqual([{ rsvp: 'waitlisted' }]);
    const [seats] = await q<{ n: number }>(
      'SELECT count(*)::int AS n FROM trip_participants WHERE trip_id = $1 AND holds_seat',
      [fx.tripId],
    );
    expect(seats!.n).toBe(6);
  });

  it('records an open without publishing anything that could name the opener', async () => {
    const since = await now();
    const opened = await run(m(1), 'record_proposal_open', {
      proposal_id: proposalId,
      kind: 'open',
      local_hour: 21,
    });
    expect(opened.body.result).toEqual({});
    // Nothing is published by the open itself; the crew-level count follows the debounce.
    const published = await outboxSince(since);
    expect(published.filter((row) => row.channel !== `user:#${m(1).uid}`)).toEqual([]);
    expect(published.map((row) => (row.payload as { type: string }).type)).toEqual(['cmd.result']);
    const queued = await q<{ start_after: Date }>(
      "SELECT start_after FROM pgboss.job WHERE name = 'proposal.suggestions'",
    );
    expect(queued).toHaveLength(1);
    expect(new Date(queued[0]!.start_after).getTime()).toBeGreaterThan(Date.now() + 5 * 60_000);
    const events = await eventsSince(since);
    expect(events.map((e) => e.type)).toEqual(['proposal.engagement_counted']);
    expect(JSON.stringify(events)).not.toContain(m(1).uid);
  });

  it('shows a private reason to the organiser only as MAYBE', async () => {
    const since = await now();
    const body = envelope(
      'submit_private_reason',
      { proposal_id: proposalId, reason: 'cost', text: 'It is a lot this month' },
      { actor: { uid: m(2).uid, via: 'app' } },
    );
    const response = await harness.request(`/v1/proposals/${proposalId}/private/reason`, {
      method: 'POST',
      headers: { cookie: m(2).cookie },
      body: JSON.stringify(body),
    });
    expect(response.status).toBe(200);
    const stream = await response.text();
    expect(stream).toContain('event: line');
    expect(stream).toContain('"id":"ask_crew"');
    const published = (await outboxSince(since)).filter(
      (row) => row.channel !== `user:#${m(2).uid}`,
    );
    expect(published.map((row) => (row.payload as { type: string }).type)).toEqual(['rsvp.status']);
    expect(published[0]!.payload).toMatchObject({ data: { status: 'maybe' } });
    const events = await eventsSince(since);
    expect(events.map((e) => e.type)).toEqual(['rsvp.changed']);
    expect(JSON.stringify(events)).not.toMatch(/cost|private/);
    const threads = await withSystem(harness.pool, (tx) =>
      tx.query('SELECT body_enc FROM private_guide_threads WHERE owner_id = $1', [m(2).uid]),
    );
    expect(threads.rows).toHaveLength(1);
  });

  it('queues the re-split once per member, and only for a real decline', async () => {
    const first = await run(m(3), 'decline_trip', { trip_id: fx.tripId });
    expect(first.body.result).toMatchObject({ rsvp: 'out' });
    await run(m(3), 'decline_trip', { trip_id: fx.tripId });
    const jobs = await q<{ data: { trip_id: string; user_id: string } }>(
      "SELECT data FROM pgboss.job WHERE name = 'trip.dropout'",
    );
    expect(jobs.map((job) => job.data)).toEqual([{ trip_id: fx.tripId, user_id: m(3).uid }]);
  });

  it('records a decline from a crew member who never answered, with no seat and no re-split', async () => {
    const participant = () =>
      q<{ rsvp: string; holds_seat: boolean }>(
        'SELECT rsvp, holds_seat FROM trip_participants WHERE trip_id = $1 AND user_id = $2',
        [fx.tripId, m(7).uid],
      );
    expect(await participant()).toEqual([]);

    // Someone no longer in the crew is still refused.
    await q("UPDATE crew_members SET status = 'left' WHERE crew_id = $1 AND user_id = $2", [
      fx.crewId,
      m(7).uid,
    ]);
    const refused = await run(m(7), 'set_rsvp', { proposal_id: proposalId, status: 'out' });
    expect(refused.body.error.code).toBe('NOT_ELIGIBLE');
    expect(await participant()).toEqual([]);
    await q("UPDATE crew_members SET status = 'active' WHERE crew_id = $1 AND user_id = $2", [
      fx.crewId,
      m(7).uid,
    ]);

    const since = await now();
    const declined = await run(m(7), 'set_rsvp', { proposal_id: proposalId, status: 'out' });
    expect(declined.status).toBe(200);
    expect(declined.body.result).toMatchObject({ rsvp: 'out', waitlisted: false });
    expect(await participant()).toEqual([{ rsvp: 'out', holds_seat: false }]);
    const events = await eventsSince(since);
    expect(events.map((e) => e.type)).toEqual(
      expect.arrayContaining(['rsvp.changed', 'participant.declined']),
    );
    const published = await outboxSince(since);
    expect(published.map((row) => (row.payload as { type: string }).type)).toContain('rsvp.status');
    // Only the member who held a seat starts a re-split.
    const jobs = await q<{ data: { trip_id: string; user_id: string } }>(
      "SELECT data FROM pgboss.job WHERE name = 'trip.dropout'",
    );
    expect(jobs.map((job) => job.data)).toEqual([{ trip_id: fx.tripId, user_id: m(3).uid }]);
  });
});

describe('resolve_dropout', () => {
  it('lets an organiser resolve a dropout once and re-prices the trip', async () => {
    await q('INSERT INTO trip_dropouts (trip_id, user_id) VALUES ($1, $2)', [fx.tripId, m(3).uid]);
    const denied = await run(m(1), 'resolve_dropout', { trip_id: fx.tripId, uid: m(3).uid });
    expect(denied.status).toBe(403);
    const done = await run(organiser, 'resolve_dropout', { trip_id: fx.tripId, uid: m(3).uid });
    expect(done.status).toBe(200);
    const [row] = await q<{ resolved_by: string }>(
      'SELECT resolved_by FROM trip_dropouts WHERE trip_id = $1 AND user_id = $2',
      [fx.tripId, m(3).uid],
    );
    expect(row!.resolved_by).toBe(organiser.uid);
    const jobs = await q("SELECT 1 FROM pgboss.job WHERE name = 'cost.recompute'");
    expect(jobs.length).toBeGreaterThan(0);
  });
});
