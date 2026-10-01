/**
 * Group swiping on the real stack: a session per trip (a second start joins it), votes on deck
 * cards only, and matches arbitrated once in the vote transaction. A two-person crew matches at
 * the second yes, a solo trip at the first; twenty concurrent yes votes on one card make exactly
 * one match and one ChangeSet suggestion, which waits for the organiser. Undo keeps a match;
 * an ended session takes no votes.
 */
import { withSystem } from '@cp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { seedCurrentPlan } from '../plan/plan-fixture';
import { buildSetupCrew, errorOf, resultOf, type SignedIn } from '../setup/setup-harness';
import { startExploreWorld, type ExploreWorld } from './explore-world';

let world: ExploreWorld;

beforeAll(async () => {
  world = await startExploreWorld();
}, 240_000);

afterAll(async () => {
  await world?.harness.stop();
});

type Match = { match_id: string; change_set_id: string | null; status: string } | null;

async function start(who: SignedIn, tripId: string): Promise<string> {
  const started = await world.harness.run(who, 'start_swipe_session', { trip_id: tripId });
  expect(started.status).toBe(200);
  const sessionId = resultOf<{ session_id: string }>(started).session_id;
  const deck = [world.pois.mustSee, ...world.pois.picks].map((poi_id, i) => ({
    poi_id,
    rank: i + 1,
    score: 1,
    reasons: [],
    note: null,
  }));
  await withSystem(world.harness.pool, (tx) =>
    tx.query("UPDATE swipe_sessions SET deck = $2, status = 'live' WHERE id = $1", [
      sessionId,
      JSON.stringify(deck),
    ]),
  );
  return sessionId;
}

const vote = (who: SignedIn, session: string, place: string, verdict = 'yes') =>
  world.harness.run(who, 'swipe_vote', { session_id: session, place_id: place, verdict });

const matchOf = (response: { body: Record<string, unknown> }): Match =>
  resultOf<{ match: Match }>(response).match;

describe('swipe sessions', () => {
  it('matches a two-person crew at the second yes, as a suggestion for the organiser', async () => {
    const [org, mate] = [world.a.organiser, world.a.members[1]!];
    const session = await start(org, world.a.tripId);
    const again = await world.harness.run(mate, 'start_swipe_session', { trip_id: world.a.tripId });
    expect(resultOf(again)).toMatchObject({ session_id: session, joined: true, match_rule: 2 });

    expect(errorOf(await vote(org, session, world.pois.stay)).code).toBe('VALIDATION');
    expect(matchOf(await vote(org, session, world.pois.picks[0]!))).toBeNull();
    expect(matchOf(await vote(mate, session, world.pois.picks[0]!, 'no'))).toBeNull();
    const matched = matchOf(await vote(mate, session, world.pois.picks[0]!, 'yes'));
    expect(matched).toMatchObject({ status: 'suggested' });

    const [set] = await world.q<{
      status: string;
      ops: { op: string; after: { poi_id: string } }[];
    }>('SELECT status, ops FROM change_sets WHERE id = $1', [matched?.change_set_id]);
    expect(set?.status).toBe('proposed');
    expect(set?.ops[0]).toMatchObject({ op: 'add', after: { poi_id: world.pois.picks[0] } });

    expect(
      resultOf(
        await world.harness.run(org, 'undo_swipe', {
          session_id: session,
          place_id: world.pois.picks[0],
        }),
      ),
    ).toMatchObject({ undone: true });
    expect(
      await world.q('SELECT 1 FROM swipe_matches WHERE session_id = $1', [session]),
    ).toHaveLength(1);

    const outsider = await world.harness.signIn();
    expect(errorOf(await vote(outsider, session, world.pois.picks[1]!)).code).toBe('NOT_FOUND');
    expect(
      errorOf(await world.harness.run(mate, 'end_swipe_session', { session_id: session })).code,
    ).toBe('FORBIDDEN');
    await world.harness.run(org, 'end_swipe_session', { session_id: session });
    expect(errorOf(await vote(mate, session, world.pois.picks[1]!))).toMatchObject({
      code: 'STATE_INVALID',
      detail: { reason: 'session_ended' },
    });
  });

  it('matches a solo trip at the first yes', async () => {
    const session = await start(world.b.organiser, world.b.tripId);
    const [row] = await world.q<{ match_rule: number }>(
      'SELECT match_rule FROM swipe_sessions WHERE id = $1',
      [session],
    );
    expect(row?.match_rule).toBe(1);
    expect(matchOf(await vote(world.b.organiser, session, world.pois.mustSee))).toMatchObject({
      status: 'unslotted',
    });
  });

  it(
    'turns twenty concurrent yes votes on one card into one match and one ChangeSet',
    { timeout: 120_000 },
    async () => {
      const crew = await buildSetupCrew(world.harness, 20);
      await withSystem(world.harness.pool, async (tx) => {
        await tx.query("UPDATE trips SET destination_id = $1, tz = 'Asia/Tokyo' WHERE id = $2", [
          world.kyoto,
          crew.tripId,
        ]);
        for (const member of crew.members.slice(1)) {
          await tx.query(
            "INSERT INTO trip_participants (trip_id, user_id, role, rsvp) VALUES ($1, $2, 'member', 'in')",
            [crew.tripId, member.uid],
          );
        }
      });
      await seedCurrentPlan(world.harness.pool, crew.tripId);
      const session = await start(crew.organiser, crew.tripId);
      const card = world.pois.picks[2]!;
      const results = await Promise.all(crew.members.map((member) => vote(member, session, card)));
      expect(results.every((response) => response.status === 200)).toBe(true);
      const matches = await world.q<{ id: string; change_set_id: string }>(
        'SELECT id, change_set_id FROM swipe_matches WHERE session_id = $1',
        [session],
      );
      expect(matches).toHaveLength(1);
      const sets = await world.q('SELECT id FROM change_sets WHERE trip_id = $1', [crew.tripId]);
      expect(sets).toEqual([{ id: matches[0]!.change_set_id }]);
      const reported = new Set(results.map((r) => matchOf(r)?.match_id).filter(Boolean));
      expect([...reported]).toEqual([matches[0]!.id]);
    },
  );
});
