/**
 * Swipe matches and the planning redesign switch on the real stack. Switched off, a match still
 * becomes a ChangeSet suggestion and answers in the shape installed apps parse. Switched on, a
 * match drops into the trip's Ideas with the yes voters as backers and no ChangeSet, and twenty
 * concurrent yes votes on one card make one match and one idea with every one of them on it.
 */
import { withSystem } from '@cp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { registerIdeaCommands } from '../../../src/commands/ideas';
import { startExploreWorld, type ExploreWorld } from '../../explore/explore-world';
import { seedCurrentPlan } from '../../plan/plan-fixture';
import { buildSetupCrew, resultOf, type SignedIn } from '../../setup/setup-harness';

let world: ExploreWorld;

/** The match as installed apps knew it before matches went to Ideas. */
const installedMatchSchema = z
  .strictObject({
    match_id: z.uuid(),
    change_set_id: z.uuid().nullable(),
    day_no: z.number().int().nullable(),
    status: z.enum(['suggested', 'unslotted']),
  })
  .nullable();

type Match = { match_id: string; change_set_id: string | null; status: string; idea_id?: string };

const setRedesign = (on: boolean) =>
  world.harness.pool.query(
    `INSERT INTO ops.ops_config (key, value, is_public) VALUES ('planning.redesign', $1::jsonb, true)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [JSON.stringify(on)],
  );

async function start(who: SignedIn, tripId: string, places: readonly string[]): Promise<string> {
  const started = await world.harness.run(who, 'start_swipe_session', { trip_id: tripId });
  expect(started.status, JSON.stringify(started.body)).toBe(200);
  const sessionId = resultOf<{ session_id: string }>(started).session_id;
  const deck = places.map((poi_id, i) => ({
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

const vote = (who: SignedIn, session: string, place: string) =>
  world.harness.run(who, 'swipe_vote', { session_id: session, place_id: place, verdict: 'yes' });

beforeAll(async () => {
  world = await startExploreWorld(registerIdeaCommands);
}, 240_000);

afterAll(async () => {
  await world?.harness.stop();
});

describe('swipe matches and Ideas', () => {
  it('switched off, a match stays a ChangeSet suggestion in the shape installed apps parse', async () => {
    await setRedesign(false);
    const [org, mate] = [world.a.organiser, world.a.members[1]!];
    const session = await start(org, world.a.tripId, world.pois.picks);
    await vote(org, session, world.pois.picks[0]!);
    const matched = await vote(mate, session, world.pois.picks[0]!);
    expect(matched.status, JSON.stringify(matched.body)).toBe(200);
    const match = resultOf<{ match: unknown }>(matched).match;
    expect(installedMatchSchema.parse(match)).toMatchObject({ status: 'suggested' });
    const late = resultOf<{ match: unknown }>(await vote(org, session, world.pois.picks[0]!));
    expect(installedMatchSchema.safeParse(late.match).success).toBe(true);
    expect(
      await world.q('SELECT 1 FROM trip_ideas WHERE trip_id = $1', [world.a.tripId]),
    ).toHaveLength(0);
  });

  it('switched on, a match drops into Ideas with the yes voters and no ChangeSet', async () => {
    await setRedesign(true);
    const session = await start(world.b.organiser, world.b.tripId, [world.pois.mustSee]);
    const matched = await vote(world.b.organiser, session, world.pois.mustSee);
    const match = resultOf<{ match: Match }>(matched).match;
    expect(match).toMatchObject({ status: 'idea', change_set_id: null });
    const ideas = await world.q<{ id: string; backer_ids: string[]; sources: string[] }>(
      'SELECT id, backer_ids, sources FROM trip_ideas WHERE trip_id = $1 AND poi_id = $2',
      [world.b.tripId, world.pois.mustSee],
    );
    expect(ideas).toEqual([
      { id: match.idea_id, backer_ids: [world.b.organiser.uid], sources: ['swipe'] },
    ]);
    expect(
      await world.q('SELECT 1 FROM change_sets WHERE trip_id = $1', [world.b.tripId]),
    ).toHaveLength(0);
    const [hint] = await world.q<{ payload: { data: Record<string, unknown> } }>(
      `SELECT payload FROM rt_outbox WHERE channel = $1 AND payload->>'type' = 'match'
        ORDER BY id DESC LIMIT 1`,
      [`swipe:${session}`],
    );
    expect(hint?.payload.data).toMatchObject({ idea_id: match.idea_id });
  });

  it(
    'turns twenty concurrent yes votes on one card into one match and one idea with all of them',
    { timeout: 120_000 },
    async () => {
      await setRedesign(true);
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
      const card = world.pois.picks[2]!;
      const session = await start(crew.organiser, crew.tripId, [card]);
      const results = await Promise.all(crew.members.map((member) => vote(member, session, card)));
      for (const result of results) expect(result.status, JSON.stringify(result.body)).toBe(200);
      const matches = await world.q('SELECT id FROM swipe_matches WHERE session_id = $1', [
        session,
      ]);
      expect(matches).toHaveLength(1);
      const ideas = await world.q<{ id: string; backer_ids: string[] }>(
        'SELECT id, backer_ids FROM trip_ideas WHERE trip_id = $1 AND deleted_at IS NULL',
        [crew.tripId],
      );
      expect(ideas).toHaveLength(1);
      expect([...ideas[0]!.backer_ids].sort()).toEqual(crew.members.map((m) => m.uid).sort());
      expect(await world.q('SELECT 1 FROM change_sets WHERE trip_id = $1', [crew.tripId])).toEqual(
        [],
      );
      const reported = new Set(
        results.map((r) => resultOf<{ match: Match | null }>(r).match?.idea_id).filter(Boolean),
      );
      expect([...reported]).toEqual([ideas[0]!.id]);
    },
  );
});
