/**
 * Stances on a place on the real stack: a participant says WANT IT or RATHER NOT with their own
 * words, saying again replaces it, clearing takes it back; a replayed op changes nothing and
 * appends no second event; an outsider is NOT_FOUND and a member who is out is FORBIDDEN.
 */
import { generateUuidV7 } from '@cp/domain';
import { withSystem } from '@cp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { clearPlaceStanceCommand } from '../../../src/commands/stances/clear-place-stance';
import { setPlaceStanceCommand } from '../../../src/commands/stances/set-place-stance';
import {
  buildSetupCrew,
  errorOf,
  startSetupHarness,
  type SetupCrew,
  type SetupHarness,
} from '../../setup/setup-harness';

let harness: SetupHarness;
let a: SetupCrew;
let b: SetupCrew;
let poi: string;

beforeAll(async () => {
  harness = await startSetupHarness((registry) => {
    registry.register(setPlaceStanceCommand);
    registry.register(clearPlaceStanceCommand);
  });
  a = await buildSetupCrew(harness, 3);
  b = await buildSetupCrew(harness, 1);
  poi = await withSystem(harness.pool, async (tx) => {
    const destination = (
      await tx.query<{ destination_id: string }>('SELECT destination_id FROM trips WHERE id = $1', [
        a.tripId,
      ])
    ).rows[0]!.destination_id;
    for (const [i, member] of a.members.slice(1).entries()) {
      await tx.query(
        `INSERT INTO trip_participants (trip_id, user_id, role, rsvp) VALUES ($1, $2, 'member', $3)`,
        [a.tripId, member.uid, i === 0 ? 'in' : 'out'],
      );
    }
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO pois (destination_id, name, category, lat, lng, curation)
       VALUES ($1, 'Pura Lempuyang', 'temple_shrine', 35.0, 135.7, 'editorial') RETURNING id`,
      [destination],
    );
    return rows[0]!.id;
  });
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

const rows = () =>
  harness.pool
    .query<{ user_id: string; stance: string; note: string | null }>(
      'SELECT user_id, stance, note FROM place_stances WHERE poi_id = $1 ORDER BY user_id',
      [poi],
    )
    .then((result) => result.rows);
const events = (type: string) =>
  harness.pool
    .query<{ n: number }>(
      `SELECT count(*)::int AS n FROM domain_events WHERE type = $1 AND payload->>'poi_id' = $2`,
      [type, poi],
    )
    .then((result) => result.rows[0]!.n);

describe('set_place_stance and clear_place_stance', () => {
  it('keeps one stance per person, with their words, and takes it back', async () => {
    const member = a.members[1]!;
    const said = await harness.run(member, 'set_place_stance', {
      trip_id: a.tripId,
      poi_id: poi,
      stance: 'rather_not',
      note: '  Five hours in a car for a queue?  ',
    });
    expect(said.body['status']).toBe('applied');
    expect(said.body['result']).toEqual({ poi_id: poi, stance: 'rather_not' });
    await harness.run(member, 'set_place_stance', {
      trip_id: a.tripId,
      poi_id: poi,
      stance: 'want',
    });
    expect(await rows()).toEqual([{ user_id: member.uid, stance: 'want', note: null }]);
    expect(await events('place.stance_set')).toBe(2);
    const cleared = await harness.run(member, 'clear_place_stance', {
      trip_id: a.tripId,
      poi_id: poi,
    });
    expect(cleared.body['result']).toEqual({ poi_id: poi, stance: null });
    expect(await rows()).toEqual([]);
    expect(await events('place.stance_cleared')).toBe(1);
  });

  it('applies a replayed op once', async () => {
    const opId = generateUuidV7();
    const payload = { trip_id: a.tripId, poi_id: poi, stance: 'want', note: 'The one photo.' };
    const first = await harness.run(a.organiser, 'set_place_stance', payload, { opId });
    const again = await harness.run(a.organiser, 'set_place_stance', payload, { opId });
    expect(first.body['status']).toBe('applied');
    expect(again.body['status']).toBe('duplicate');
    expect(await rows()).toEqual([
      { user_id: a.organiser.uid, stance: 'want', note: 'The one photo.' },
    ]);
    expect(await events('place.stance_set')).toBe(3);
  });

  it('refuses outsiders, members who are out, and notes over 140 characters', async () => {
    const outsider = await harness.run(b.organiser, 'set_place_stance', {
      trip_id: a.tripId,
      poi_id: poi,
      stance: 'want',
    });
    expect(errorOf(outsider).code ?? outsider.body['code']).toBe('NOT_FOUND');
    const out = await harness.run(a.members[2]!, 'set_place_stance', {
      trip_id: a.tripId,
      poi_id: poi,
      stance: 'want',
    });
    expect(out.body['code'] ?? errorOf(out).code).toBe('FORBIDDEN');
    const long = await harness.run(a.members[1]!, 'set_place_stance', {
      trip_id: a.tripId,
      poi_id: poi,
      stance: 'want',
      note: 'x'.repeat(141),
    });
    expect(long.body['code'] ?? errorOf(long).code).toBe('VALIDATION');
  });
});
