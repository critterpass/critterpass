/**
 * Group swiping on the real stack: a session per trip (a second start joins it), votes on deck
 * cards only, and matches arbitrated once in the vote transaction. A two-person crew matches at
 * the second yes, a solo trip at the first; a match goes to the trip's Ideas, never a ChangeSet
 * (the concurrent race is in commands/ideas/swipe-to-ideas.db.test.ts). Undo keeps a match; an
 * ended session takes no votes.
 */
import { withSystem } from '@cp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { errorOf, resultOf, type SignedIn } from '../setup/setup-harness';
import { startExploreWorld, type ExploreWorld } from './explore-world';

let world: ExploreWorld;

beforeAll(async () => {
  world = await startExploreWorld();
}, 240_000);

afterAll(async () => {
  await world?.harness.stop();
});

type Match = {
  match_id: string;
  change_set_id: string | null;
  status: string;
  idea_id?: string;
} | null;

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
  it("matches a two-person crew at the second yes, into the trip's Ideas", async () => {
    const [org, mate] = [world.a.organiser, world.a.members[1]!];
    const session = await start(org, world.a.tripId);
    const again = await world.harness.run(mate, 'start_swipe_session', { trip_id: world.a.tripId });
    expect(resultOf(again)).toMatchObject({ session_id: session, joined: true, match_rule: 2 });

    expect(errorOf(await vote(org, session, world.pois.stay)).code).toBe('VALIDATION');
    expect(matchOf(await vote(org, session, world.pois.picks[0]!))).toBeNull();
    expect(matchOf(await vote(mate, session, world.pois.picks[0]!, 'no'))).toBeNull();
    const matched = matchOf(await vote(mate, session, world.pois.picks[0]!, 'yes'));
    expect(matched).toMatchObject({ status: 'idea', change_set_id: null });
    const ideas = await world.q<{ id: string; backer_ids: string[] }>(
      'SELECT id, backer_ids FROM trip_ideas WHERE trip_id = $1 AND poi_id = $2',
      [world.a.tripId, world.pois.picks[0]],
    );
    expect(ideas.map((idea) => idea.id)).toEqual([matched?.idea_id]);
    expect([...ideas[0]!.backer_ids].sort()).toEqual([org.uid, mate.uid].sort());
    expect(
      await world.q('SELECT 1 FROM change_sets WHERE trip_id = $1', [world.a.tripId]),
    ).toHaveLength(0);

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
      status: 'idea',
    });
  });
});
