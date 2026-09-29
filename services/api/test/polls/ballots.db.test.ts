/**
 * `create_poll`, `cast_ballot` and `retract_ballot` over the real stack: one ballot per voter,
 * changed in place; the last ballot needed closes the poll (plurality, or an approval's decider);
 * a ballot after the close answers `VOTE_CLOSED` with the result, on the online door and through
 * the offline queue; ineligible voters and outsiders are refused.
 */
import { generateUuidV7, type PollTallyResult } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { CommandDoorsHarness, SignedIn } from '../routes/command-doors-harness';
import {
  buildPollCrew,
  errorCode,
  resultOf,
  run,
  startPollDoors,
  type PollCrew,
} from './poll-fixture';

let harness: CommandDoorsHarness;
let crew: PollCrew;

beforeAll(async () => {
  harness = await startPollDoors();
  crew = await buildPollCrew(harness, 3);
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

const query = <T extends object>(sql: string, params: unknown[] = []) =>
  harness.pool.query<T>(sql, params).then((r) => r.rows);

async function chatPoll(
  extra: Record<string, unknown> = {},
  by: SignedIn = crew.organiser,
): Promise<{ pollId: string; options: string[] }> {
  const pollId = generateUuidV7();
  const response = await run(harness, by, 'create_poll', {
    poll_id: pollId,
    crew_id: crew.crewId,
    kind: 'generic',
    question: 'Dinner tonight?',
    options: [{ label: 'Tacos' }, { label: 'Ramen' }, { label: 'Pho' }],
    ...extra,
  });
  if (response.status !== 200) throw new Error(`create_poll: ${JSON.stringify(response.body)}`);
  const options = await query<{ id: string }>(
    'SELECT id FROM poll_options WHERE poll_id = $1 ORDER BY position',
    [pollId],
  );
  return { pollId, options: options.map((row) => row.id) };
}

const vote = (who: SignedIn, pollId: string, optionId: string) =>
  run(harness, who, 'cast_ballot', { poll_id: pollId, option_id: optionId });

describe('create_poll', () => {
  it('snapshots every active member and posts the card in chat', async () => {
    const { pollId } = await chatPoll();
    const [poll] = await query<{ n: number; stage: string | null }>(
      'SELECT cardinality(eligible_voter_ids) AS n, stage FROM polls WHERE id = $1',
      [pollId],
    );
    expect(poll).toEqual({ n: 3, stage: null });
    expect(
      await query("SELECT 1 FROM messages WHERE type = 'poll' AND ref_id = $1", [pollId]),
    ).toHaveLength(1);
  });

  it('refuses duplicate answers, one answer, and a deadline out of range', async () => {
    const base = { crew_id: crew.crewId, kind: 'generic', question: 'Q?' };
    for (const payload of [
      { ...base, options: [{ label: 'A' }, { label: 'a' }] },
      { ...base, options: [{ label: 'A' }] },
      {
        ...base,
        options: [{ label: 'A' }, { label: 'B' }],
        closes_at: new Date(Date.now() + 60_000).toISOString(),
      },
    ]) {
      expect(errorCode(await run(harness, crew.organiser, 'create_poll', payload))).toBe(
        'VALIDATION',
      );
    }
  });

  it('keeps approvals and decisions to a trip organiser', async () => {
    const response = await run(harness, crew.members[1]!, 'create_poll', {
      crew_id: crew.crewId,
      kind: 'decision',
      question: 'Move dinner?',
      options: [{ label: 'Yes' }, { label: 'No' }],
    });
    expect(errorCode(response)).toBe('FORBIDDEN');
  });
});

describe('cast_ballot', () => {
  it('upserts one ballot per voter and returns the tallies for the stamp', async () => {
    const { pollId, options } = await chatPoll();
    const first = await vote(crew.members[1]!, pollId, options[0]!);
    expect(resultOf<PollTallyResult>(first)).toMatchObject({
      status: 'open',
      option_tallies: { [options[0]!]: 1, [options[1]!]: 0, [options[2]!]: 0 },
      pending_count: 2,
      eligible_count: 3,
      my_option_id: options[0],
    });
    const changed = await vote(crew.members[1]!, pollId, options[1]!);
    expect(resultOf<PollTallyResult>(changed).option_tallies).toMatchObject({
      [options[0]!]: 0,
      [options[1]!]: 1,
    });
    const same = await vote(crew.members[1]!, pollId, options[1]!);
    expect(resultOf<PollTallyResult>(same).pending_count).toBe(2);
    expect(await query('SELECT 1 FROM ballots WHERE poll_id = $1', [pollId])).toHaveLength(1);
    const events = await query<{ type: string }>(
      "SELECT type FROM domain_events WHERE aggregate_id = $1 AND type LIKE 'ballot.%' ORDER BY occurred_at, id",
      [pollId],
    );
    expect(events.map((e) => e.type)).toEqual(['ballot.cast', 'ballot.changed']);
    expect(
      await query('SELECT 1 FROM rt_outbox WHERE channel = $1', [`poll:${pollId}`]),
    ).not.toHaveLength(0);
  });

  it('closes the poll with the last ballot and names the winner', async () => {
    const { pollId, options } = await chatPoll();
    await vote(crew.members[0]!, pollId, options[2]!);
    await vote(crew.members[1]!, pollId, options[2]!);
    const last = await vote(crew.members[2]!, pollId, options[0]!);
    expect(resultOf<PollTallyResult>(last)).toMatchObject({
      status: 'closed',
      winner_option_id: options[2],
      pending_count: 0,
    });
    const [poll] = await query<{ close_reason: string }>(
      'SELECT close_reason FROM polls WHERE id = $1',
      [pollId],
    );
    expect(poll?.close_reason).toBe('all_voted');
    expect(
      await query("SELECT 1 FROM domain_events WHERE type = 'poll.closed' AND aggregate_id = $1", [
        pollId,
      ]),
    ).toHaveLength(1);
  });

  it('answers a late ballot with VOTE_CLOSED and the result, online and offline', async () => {
    const { pollId, options } = await chatPoll();
    for (const member of crew.members) await vote(member, pollId, options[1]!);
    const late = await vote(crew.members[0]!, pollId, options[0]!);
    expect(late.status).toBe(409);
    expect(late.body['error']).toMatchObject({
      code: 'VOTE_CLOSED',
      detail: { result: { status: 'closed', winner_option_id: options[1] } },
    });
    const opId = generateUuidV7();
    const upload = await harness.request('/sync/upload', {
      method: 'POST',
      headers: { cookie: crew.members[1]!.cookie },
      body: JSON.stringify({
        ops: [
          {
            op_id: opId,
            cmd: 'cast_ballot',
            v: 1,
            actor: { uid: crew.members[1]!.uid, via: 'offline' },
            device: { id: 'device-offline', platform: 'ios', app_version: '1.0.0', tz: 'Asia/Saigon' },
            client_ts: new Date().toISOString(),
            payload: { poll_id: pollId, option_id: options[0] },
          },
        ],
      }),
    });
    expect(upload.status).toBeLessThan(300);
    const [result] = await query<{ status: string; code: string }>(
      'SELECT status, code FROM cmd_results WHERE op_id = $1',
      [opId],
    );
    expect(result).toEqual({ status: 'rejected', code: 'VOTE_CLOSED' });
  });

  it('refuses a change where minds may not change, and a voter outside the snapshot', async () => {
    const { pollId, options } = await chatPoll({ allow_change: false });
    await vote(crew.members[1]!, pollId, options[0]!);
    expect(errorCode(await vote(crew.members[1]!, pollId, options[1]!))).toBe('STATE_INVALID');
    const newcomer = await harness.signInAnonymously();
    await query("INSERT INTO crew_members (crew_id, user_id, role) VALUES ($1, $2, 'member')", [
      crew.crewId,
      newcomer.uid,
    ]);
    const refused = await vote(newcomer, pollId, options[0]!);
    expect(refused.status).toBe(403);
    expect(errorCode(refused)).toBe('NOT_ELIGIBLE');
    const outsider = await harness.signInAnonymously();
    expect((await vote(outsider, pollId, options[0]!)).status).toBe(404);
  });

  it('lets a voter take their ballot back', async () => {
    const { pollId, options } = await chatPoll();
    await vote(crew.members[2]!, pollId, options[0]!);
    const back = await run(harness, crew.members[2]!, 'retract_ballot', { poll_id: pollId });
    const tally = resultOf<PollTallyResult>(back);
    expect(tally.my_option_id).toBeNull();
    expect(tally.pending_count).toBe(tally.eligible_count);
  });

  it('closes an approval as soon as its decider is satisfied', async () => {
    const tripId = (
      await query<{ id: string }>(
        "INSERT INTO trips (crew_id, status) VALUES ($1, 'setup') RETURNING id",
        [crew.crewId],
      )
    )[0]!.id;
    await query(
      `INSERT INTO trip_participants (trip_id, user_id, role, rsvp)
       SELECT $1, user_id, CASE WHEN user_id = $2 THEN 'organiser' ELSE 'member' END, 'in'
         FROM crew_members WHERE crew_id = $3 AND status = 'active'`,
      [tripId, crew.organiser.uid, crew.crewId],
    );
    const pollId = generateUuidV7();
    const created = await run(harness, crew.organiser, 'create_poll', {
      poll_id: pollId,
      crew_id: crew.crewId,
      trip_id: tripId,
      kind: 'changeset_approval',
      question: 'Swap day 2?',
      options: [{ label: 'Approve' }, { label: 'Keep' }],
      decider_policy: 'threshold_n',
      threshold: 2,
    });
    expect(created.status).toBe(200);
    const options = (
      await query<{ id: string }>(
        'SELECT id FROM poll_options WHERE poll_id = $1 ORDER BY position',
        [pollId],
      )
    ).map((row) => row.id);
    await vote(crew.members[1]!, pollId, options[0]!);
    const second = await vote(crew.members[2]!, pollId, options[0]!);
    expect(resultOf<PollTallyResult>(second)).toMatchObject({
      status: 'closed',
      winner_option_id: options[0],
    });
    const [poll] = await query<{ close_reason: string }>(
      'SELECT close_reason FROM polls WHERE id = $1',
      [pollId],
    );
    expect(poll?.close_reason).toBe('decider');
  });
});
