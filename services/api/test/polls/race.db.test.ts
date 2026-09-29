/**
 * The deadline race: twenty voters cast at once from every surface (the app, the offline queue, the
 * widget, a notification action, a Live Activity), several of them twice with different answers
 * and some replaying the same op. The poll row lock leaves exactly one ballot per voter, tallies
 * that add up, and one close.
 */
import { generateUuidV7 } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { CommandDoorsHarness, SignedIn } from '../routes/command-doors-harness';
import { buildPollCrew, run, startPollDoors, type PollCrew } from './poll-fixture';

const VOTERS = 20;
const VIAS = ['app', 'offline', 'widget', 'notif_action', 'la_intent'] as const;

let harness: CommandDoorsHarness;
let crew: PollCrew;

beforeAll(async () => {
  harness = await startPollDoors();
  crew = await buildPollCrew(harness, VOTERS);
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

const query = <T extends object>(sql: string, params: unknown[] = []) =>
  harness.pool.query<T>(sql, params).then((r) => r.rows);

function castAs(
  who: SignedIn,
  via: string,
  pollId: string,
  optionId: string,
  opId = generateUuidV7(),
) {
  return harness.request('/v1/cmd/cast_ballot', {
    method: 'POST',
    headers: { cookie: who.cookie },
    body: JSON.stringify({
      op_id: opId,
      cmd: 'cast_ballot',
      v: 1,
      actor: { uid: who.uid, via },
      device: { id: `device-${via}`, platform: 'ios', app_version: '1.0.0', tz: 'Asia/Saigon' },
      client_ts: new Date().toISOString(),
      payload: { poll_id: pollId, option_id: optionId },
    }),
  });
}

describe('mixed-surface ballot race', { timeout: 120_000 }, () => {
  it('ends with one ballot per voter, consistent tallies and a single close', async () => {
    const pollId = generateUuidV7();
    const created = await run(harness, crew.organiser, 'create_poll', {
      poll_id: pollId,
      crew_id: crew.crewId,
      kind: 'generic',
      question: 'Which beach?',
      options: [{ label: 'North' }, { label: 'South' }],
    });
    expect(created.status).toBe(200);
    const [north, south] = (
      await query<{ id: string }>(
        'SELECT id FROM poll_options WHERE poll_id = $1 ORDER BY position',
        [pollId],
      )
    ).map((row) => row.id) as [string, string];

    const requests: Promise<Response>[] = [];
    for (const [i, voter] of crew.members.entries()) {
      const via = VIAS[i % VIAS.length]!;
      const opId = generateUuidV7();
      requests.push(castAs(voter, via, pollId, i % 2 === 0 ? north : south, opId));
      if (i % 4 === 0) requests.push(castAs(voter, via, pollId, i % 2 === 0 ? north : south, opId));
      if (i % 5 === 1) requests.push(castAs(voter, VIAS[(i + 1) % VIAS.length]!, pollId, north));
    }
    const statuses = (await Promise.all(requests)).map((response) => response.status);
    // Every request is applied, a duplicate replay, or a refusal after the poll closed.
    expect(statuses.every((status) => status === 200 || status === 409)).toBe(true);

    const ballots = await query<{ user_id: string; option_id: string; source: string }>(
      'SELECT user_id, option_id, source FROM ballots WHERE poll_id = $1',
      [pollId],
    );
    expect(new Set(ballots.map((b) => b.user_id)).size).toBe(VOTERS);
    expect(ballots).toHaveLength(VOTERS);
    expect(new Set(ballots.map((b) => b.source))).toEqual(
      new Set(['app', 'widget', 'notification', 'la']),
    );

    const [poll] = await query<{
      status: string;
      result: { option_tallies: Record<string, number> };
    }>('SELECT status, result FROM polls WHERE id = $1', [pollId]);
    expect(poll?.status).toBe('closed');
    const counted = { [north]: 0, [south]: 0 };
    for (const ballot of ballots) counted[ballot.option_id] = (counted[ballot.option_id] ?? 0) + 1;
    expect(poll?.result.option_tallies).toEqual(counted);
    expect(
      await query("SELECT 1 FROM domain_events WHERE type = 'poll.closed' AND aggregate_id = $1", [
        pollId,
      ]),
    ).toHaveLength(1);
  });
});
