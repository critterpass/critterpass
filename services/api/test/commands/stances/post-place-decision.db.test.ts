/**
 * Posting a way out of a split on the real stack: SUGGEST puts the chosen way against leaving the
 * place out, a vote puts the two ways against each other; each way is a change set in voting on
 * one decision poll whose card lands in crew chat. When the crew has voted, the winning way
 * applies to the plan and the other is rejected.
 */
import { onEventAppended, splitDecisionEventHook, withSystem } from '@cp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { castBallotCommand } from '../../../src/commands/polls/cast-ballot';
import { postPlaceDecisionCommand } from '../../../src/commands/stances/post-place-decision';
import { registerSplitRoute, type SplitView } from '../../../src/planning/split/route';
import { seedCurrentPlan } from '../../plan/plan-fixture';
import {
  buildSetupCrew,
  startSetupHarness,
  type SetupCrew,
  type SetupHarness,
} from '../../setup/setup-harness';
import { seedLiveDestinations } from '../../travel-data/travel-seed';

let harness: SetupHarness;
let a: SetupCrew;
let lempuyang: string;
let gangga: string;
let options: SplitView['options'];

const OPEN = {
  weekly: Object.fromEntries(
    ['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'].map((d) => [d, [{ start: '07:00', end: '17:00' }]]),
  ),
};

beforeAll(async () => {
  onEventAppended(splitDecisionEventHook);
  harness = await startSetupHarness(undefined, (app, deps) => {
    deps.registry.register(postPlaceDecisionCommand({ redis: deps.redis }));
    deps.registry.register(castBallotCommand);
    registerSplitRoute(app, deps);
  });
  a = await buildSetupCrew(harness, 4);
  const bali = (await seedLiveDestinations(harness.pool))['bali'] ?? '';
  const place = (name: string, lat: number) =>
    withSystem(harness.pool, async (tx) => {
      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO pois (destination_id, name, category, lat, lng, curation, hours, editorial, tags)
         VALUES ($1, $2, 'temple_shrine', $3, 115.6, 'editorial', $4, '{"time_needed_min": 120}',
                 '{temple}') RETURNING id`,
        [bali, name, lat, JSON.stringify(OPEN)],
      );
      return rows[0]!.id;
    });
  lempuyang = await place('Pura Lempuyang', -8.39);
  gangga = await place('Tirta Gangga', -8.41);
  await withSystem(harness.pool, async (tx) => {
    await tx.query('UPDATE trips SET destination_id = $1, tz = $2 WHERE id = $3', [
      bali,
      'Asia/Makassar',
      a.tripId,
    ]);
    for (const member of a.members.slice(1)) {
      await tx.query(
        "INSERT INTO trip_participants (trip_id, user_id, role, rsvp) VALUES ($1, $2, 'member', 'in')",
        [a.tripId, member.uid],
      );
    }
    const [m0, m1, m2, m3] = a.members;
    await tx.query(
      `INSERT INTO place_stances (trip_id, poi_id, user_id, stance) VALUES
         ($1, $2, $3, 'want'), ($1, $2, $4, 'want'), ($1, $2, $5, 'rather_not'),
         ($1, $2, $6, 'rather_not')`,
      [a.tripId, lempuyang, m0!.uid, m1!.uid, m2!.uid, m3!.uid],
    );
  });
  await seedCurrentPlan(harness.pool, a.tripId);
  const response = await harness.request(`/v1/trips/${a.tripId}/places/${lempuyang}/split`, {
    headers: { cookie: a.members[2]!.cookie },
  });
  options = ((await response.json()) as SplitView).options;
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

const pollOf = async (pollId: string) => {
  const poll = await harness.pool.query<{ kind: string; closes_at: Date | null }>(
    'SELECT kind, closes_at FROM polls WHERE id = $1',
    [pollId],
  );
  const opts = await harness.pool.query<{ id: string; kind: string; ref_id: string | null }>(
    'SELECT id, kind, ref_id FROM poll_options WHERE poll_id = $1 ORDER BY position',
    [pollId],
  );
  const sets = await harness.pool.query<{ id: string; status: string; trigger: string }>(
    'SELECT id, status, trigger FROM change_sets WHERE poll_id = $1 ORDER BY id',
    [pollId],
  );
  const card = await harness.pool.query('SELECT 1 FROM messages WHERE ref_id = $1', [pollId]);
  return { poll: poll.rows[0]!, options: opts.rows, sets: sets.rows, cards: card.rowCount };
};

const post = (mode: 'suggest' | 'vote', ids: string[], who = a.members[2]!) =>
  harness.run(who, 'post_place_decision', {
    trip_id: a.tripId,
    poi_id: lempuyang,
    option_ids: ids,
    mode,
  });

describe('post_place_decision', () => {
  it('suggests the chosen way against leaving the place out', async () => {
    expect(options.map((o) => o.kind)).toEqual(['split_group', 'alternative']);
    const result = await post('suggest', [options[0]!.option_id]);
    expect(result.body['status']).toBe('applied');
    const {
      poll,
      options: opts,
      sets,
      cards,
    } = await pollOf((result.body['result'] as { poll_id: string }).poll_id);
    expect(poll.kind).toBe('decision');
    expect(poll.closes_at).not.toBeNull();
    expect(opts.map((o) => o.kind)).toEqual(['changeset', 'text']);
    expect(sets).toEqual([{ id: opts[0]!.ref_id, status: 'voting', trigger: 'split' }]);
    expect(cards).toBe(1);
  });

  it('refuses a suggestion with two ways and a vote with one', async () => {
    const two = await post(
      'suggest',
      options.map((o) => o.option_id),
    );
    expect(two.body['code'] ?? (two.body['error'] as { code?: string })?.code).toBe('VALIDATION');
    const one = await post('vote', [options[0]!.option_id]);
    expect(one.body['code'] ?? (one.body['error'] as { code?: string })?.code).toBe('VALIDATION');
  });

  it('applies the way the crew voted for and rejects the other', async () => {
    const result = await post(
      'vote',
      options.map((o) => o.option_id),
    );
    const pollId = (result.body['result'] as { poll_id: string }).poll_id;
    const { options: opts } = await pollOf(pollId);
    expect(opts.map((o) => o.kind)).toEqual(['changeset', 'changeset']);
    const instead = opts[1]!;
    for (const member of a.members) {
      const open = await harness.pool.query(
        "SELECT 1 FROM polls WHERE id = $1 AND status = 'open'",
        [pollId],
      );
      if (open.rowCount === 0) break;
      const cast = await harness.run(member, 'cast_ballot', {
        poll_id: pollId,
        option_id: instead.id,
      });
      expect(cast.body['status']).toBe('applied');
    }
    const after = await pollOf(pollId);
    const status = new Map(after.sets.map((set) => [set.id, set.status]));
    expect(status.get(instead.ref_id!)).toBe('applied');
    expect(status.get(opts[0]!.ref_id!)).toBe('rejected');
    const added = await harness.pool.query(
      `SELECT 1 FROM plan_items i JOIN trips t ON t.current_version_id = i.version_id
        WHERE t.id = $1 AND i.poi_id = $2`,
      [a.tripId, gangga],
    );
    expect(added.rowCount).toBe(1);
  });
});
