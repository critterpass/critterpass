/**
 * The vote and SOS activities against a migrated Postgres and the recorded fake APNs server, on
 * phones whose build draws both (`drawn` tokens):
 * - a poll closing within a day push-starts on every voter, its tallies and voters moving on one
 *   broadcast; closing it ends it with the winner;
 * - an SOS push-starts on every crewmate but never on the sender, whose phone starts its own; a
 *   new responder is urgent; resolving it ends it; no position travels in any payload.
 */
import { randomBytes } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { eventOf, isBroadcast, startLaWorld, type LaWorld } from './la-world';

let world: LaWorld;
let pollId: string;
const options: string[] = [];

const aps = (request: { body: Record<string, unknown> }) =>
  request.body['aps'] as {
    'content-state': Record<string, unknown>;
    attributes?: Record<string, unknown>;
    alert?: { title: string; body: string };
  };

beforeAll(async () => {
  world = await startLaWorld();
  for (const [i, device] of world.devices.entries()) {
    for (const kind of ['vote', 'sos']) {
      await world.q(
        `INSERT INTO la_push_to_start_tokens (device_id, user_id, activity_type, token, env, drawn)
         VALUES ($1, $2, $3, $4, 'sandbox', true)`,
        [device, world.trip.members[i], kind, randomBytes(32).toString('hex')],
      );
    }
  }
  const { crewId, tripId, members } = world.trip;
  const [poll] = await world.q<{ id: string }>(
    `INSERT INTO polls (crew_id, trip_id, kind, question, created_by, eligible_voter_ids, closes_at)
     VALUES ($1, $2, 'generic', 'Dinner on the last night?', $3, $4::uuid[], $5) RETURNING id`,
    [crewId, tripId, members[0], members, new Date(world.now.getTime() + 5 * 3_600_000)],
  );
  pollId = poll!.id;
  for (const [position, label] of ['Locavore', 'Warung Biah Biah'].entries()) {
    const [option] = await world.q<{ id: string }>(
      `INSERT INTO poll_options (poll_id, crew_id, trip_id, kind, label, position)
       VALUES ($1, $2, $3, 'text', $4, $5) RETURNING id`,
      [pollId, crewId, tripId, label, position],
    );
    options.push(option!.id);
  }
  world.drain();
}, 240_000);

afterAll(async () => {
  await world?.stop();
});

const vote = (member: number, option: number) =>
  world.q(
    `INSERT INTO ballots (poll_id, option_id, crew_id, trip_id, user_id, op_id)
     VALUES ($1, $2, $3, $4, $5, gen_random_uuid())`,
    [pollId, options[option], world.trip.crewId, world.trip.tripId, world.trip.members[member]],
  );

describe('la.orchestrate vote', { timeout: 60_000 }, () => {
  it('push-starts on every voter when the poll closes within a day', async () => {
    await vote(0, 1);
    expect(await world.orchestrate('vote', pollId)).toMatchObject({ outcome: 'sent', sends: 4 });
    const sent = world.drain();
    expect(sent.map(eventOf)).toEqual(['start', 'start', 'start', 'start']);
    expect(aps(sent[0]!).attributes).toEqual({
      poll_id: pollId,
      question: 'Dinner on the last night?',
    });
    expect(aps(sent[0]!).alert?.body).toBe('Dinner on the last night?');
    expect(aps(sent[0]!)['content-state']).toMatchObject({
      state: 'open',
      eligible: 4,
      voted: [expect.stringMatching(/^[0-9a-f]{8}$/)],
      tallies: [
        { option_id: options[1], label: 'Warung Biah Biah', count: 1, leading: true },
        { option_id: options[0], label: 'Locavore', count: 0, leading: false },
      ],
    });
  });

  it('a ballot is one broadcast with the new tally', async () => {
    await vote(1, 0);
    await vote(2, 0);
    expect(await world.orchestrate('vote', pollId)).toMatchObject({ sends: 1 });
    const [update, ...rest] = world.drain();
    expect(rest).toHaveLength(0);
    expect(isBroadcast(update!)).toBe(true);
    const state = aps(update!)['content-state'];
    expect(state['voted']).toHaveLength(3);
    expect(state['tallies']).toEqual([
      expect.objectContaining({ label: 'Locavore', count: 2, leading: true }),
      expect.objectContaining({ label: 'Warung Biah Biah', count: 1, leading: false }),
    ]);
  });

  it('closing ends it with the winner', async () => {
    await world.q(
      "UPDATE polls SET status = 'closed', winner_option_id = $2, closed_at = now() WHERE id = $1",
      [pollId, options[0]],
    );
    await world.orchestrate('vote', pollId);
    const [end, ...rest] = world.drain();
    expect(rest).toHaveLength(0);
    expect(eventOf(end!)).toBe('end');
    expect(aps(end!)['content-state']).toMatchObject({ state: 'closed', winner_label: 'Locavore' });
    expect(await world.orchestrate('vote', pollId)).toEqual({ outcome: 'idle' });
  });
});

describe('la.orchestrate sos', { timeout: 60_000 }, () => {
  let sosId: string;

  it('push-starts on every crewmate at once, never on the sender, with no position', async () => {
    const [sos] = await world.q<{ id: string }>(
      `WITH share AS (
         INSERT INTO location_shares (trip_id, user_id, reason) VALUES ($1, $2, 'sos') RETURNING id)
       INSERT INTO help_sessions (id, trip_id, user_id, kind, status, share_id)
       SELECT id, $1, $2, 'sos', 'open', id FROM share RETURNING id`,
      [world.trip.tripId, world.trip.members[3]],
    );
    sosId = sos!.id;
    await world.q(
      `INSERT INTO location_fixes (user_id, trip_id, share_id, lat, lng, accuracy_m, at)
       VALUES ($1, $2, $3, -8.5031, 115.2544, 8, $4)`,
      [world.trip.members[3], world.trip.tripId, sosId, new Date(world.now.getTime() - 3 * 60_000)],
    );
    expect(await world.orchestrate('sos', sosId)).toMatchObject({
      outcome: 'sent',
      sends: 3,
      fallbacks: 0,
    });
    const sent = world.drain();
    expect(sent.map(eventOf)).toEqual(['start', 'start', 'start']);
    expect(sent.every((r) => r.headers['apns-priority'] === '10')).toBe(true);
    expect(JSON.stringify(sent.map((r) => r.body))).not.toMatch(/-8\.50|115\.25|"lat"|"lng"/);
    expect(aps(sent[0]!).attributes).toEqual({ sos_id: sosId, sender_name: 'Alex' });
    expect(aps(sent[0]!).alert?.title).toBe('Alex needs help');
    expect(aps(sent[0]!)['content-state']).toMatchObject({
      state: 'open',
      responders: 0,
      last_seen_min: 3,
    });
    const started = await world.q<{ user_id: string }>(
      "SELECT user_id FROM device_activities WHERE kind = 'sos' AND ref_id = $1",
      [sosId],
    );
    expect(started.map((r) => r.user_id)).not.toContain(world.trip.members[3]);
  });

  it('someone coming is an urgent update on each phone', async () => {
    await world.q(
      `UPDATE device_activities SET state = 'active', activity_push_token = $2, token_env = 'sandbox'
        WHERE kind = 'sos' AND ref_id = $1`,
      [sosId, randomBytes(32).toString('hex')],
    );
    await world.q(
      `UPDATE help_sessions SET status = 'responding',
         responses = jsonb_build_object($2::text, jsonb_build_object('state', 'coming'))
       WHERE id = $1`,
      [sosId, world.trip.members[0]],
    );
    expect(await world.orchestrate('sos', sosId)).toMatchObject({ sends: 3 });
    const sent = world.drain();
    expect(sent.map(eventOf)).toEqual(['update', 'update', 'update']);
    expect(sent.every((r) => r.headers['apns-priority'] === '10')).toBe(true);
    expect(aps(sent[0]!)['content-state']).toMatchObject({ state: 'responding', responders: 1 });
  });

  it('resolving ends it everywhere', async () => {
    await world.q(
      "UPDATE help_sessions SET status = 'resolved', resolved_at = now() WHERE id = $1",
      [sosId],
    );
    await world.orchestrate('sos', sosId);
    const sent = world.drain();
    expect(sent.map(eventOf)).toEqual(['end', 'end', 'end']);
    expect(aps(sent[0]!)['content-state']).toMatchObject({ state: 'resolved' });
  });
});
