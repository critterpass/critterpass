/**
 * Trip ideas on the real stack: two members saving one place make one idea with both backers (also
 * when they save at the same moment), a place outside the destination is refused, someone outside
 * the crew finds nothing, the ♡ on a place page backs and leaves the idea, only a backer or an
 * organiser removes it, and a hide stays its owner's.
 */
import { withSystem } from '@cp/db';
import { generateUuidV7 } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerIdeaCommands } from '../../../src/commands/ideas';
import { savePlaceCommand, unsavePlaceCommand } from '../../../src/commands/places/save-place';
import {
  buildSetupCrew,
  errorOf,
  resultOf,
  startSetupHarness,
  type SetupCrew,
  type SetupHarness,
  type SignedIn,
} from '../../setup/setup-harness';

let harness: SetupHarness;
let crew: SetupCrew;
let outsider: SignedIn;
let temple: string;
let garden: string;
let castle: string;
let neighbour: string;

interface IdeaRow {
  id: string;
  backer_ids: string[];
  sources: string[];
  name: string;
  deleted_at: Date | null;
}

async function ideas(): Promise<IdeaRow[]> {
  const { rows } = await harness.pool.query<IdeaRow>(
    'SELECT id, backer_ids, sources, name, deleted_at FROM trip_ideas WHERE trip_id = $1 ORDER BY created_at',
    [crew.tripId],
  );
  return rows;
}

async function poi(destinationId: string, name: string, lat: number, lng: number): Promise<string> {
  const { rows } = await harness.pool.query<{ id: string }>(
    `INSERT INTO pois (destination_id, name, category, lat, lng)
     VALUES ($1, $2, 'temple_shrine', $3, $4) RETURNING id`,
    [destinationId, name, lat, lng],
  );
  return rows[0]!.id;
}

beforeAll(async () => {
  harness = await startSetupHarness((registry) => {
    registerIdeaCommands(registry);
    registry.register(savePlaceCommand);
    registry.register(unsavePlaceCommand);
  });
  crew = await buildSetupCrew(harness, 3);
  outsider = await harness.signIn();
  const kyoto = await withSystem(harness.pool, async (tx) => {
    const { rows } = await tx.query<{ destination_id: string }>(
      `UPDATE destinations d
          SET place_bounds = ST_GeogFromText('POLYGON((135.6 34.9, 135.9 34.9, 135.9 35.1, 135.6 35.1, 135.6 34.9))')
         FROM trips t WHERE t.id = $1 AND d.id = t.destination_id
       RETURNING d.id AS destination_id`,
      [crew.tripId],
    );
    return rows[0]!.destination_id;
  });
  const { rows: osaka } = await harness.pool.query<{ id: string }>(
    `INSERT INTO destinations (slug, name, coverage, tz) VALUES ($1, 'Osaka', 'live', 'Asia/Tokyo')
     RETURNING id`,
    [`osaka-${generateUuidV7().slice(-8)}`],
  );
  temple = await poi(kyoto, 'Kinkaku-ji', 35.0394, 135.7292);
  garden = await poi(kyoto, 'Ryoan-ji', 35.0345, 135.7182);
  // Owned by Osaka but inside Kyoto's place box: still a Kyoto place.
  neighbour = await poi(osaka[0]!.id, 'Fushimi Inari', 34.9671, 135.7727);
  castle = await poi(osaka[0]!.id, 'Osaka Castle', 34.6873, 135.5262);
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

describe('save_idea', () => {
  it('makes one idea with both backers when two members save the same place', async () => {
    const [, first, second] = crew.members as [SignedIn, SignedIn, SignedIn];
    const saved = await harness.run(first, 'save_idea', {
      trip_id: crew.tripId,
      poi_id: temple,
      source: 'search',
    });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    const again = await harness.run(second, 'save_idea', {
      trip_id: crew.tripId,
      poi_id: temple,
      source: 'map',
    });
    expect(again.status, JSON.stringify(again.body)).toBe(200);
    const result = resultOf<{ idea_id: string; backer_ids: string[] }>(again);
    expect(result.idea_id).toBe(resultOf<{ idea_id: string }>(saved).idea_id);
    expect(result.backer_ids).toEqual([first.uid, second.uid]);
    const rows = (await ideas()).filter((row) => row.deleted_at === null);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: 'Kinkaku-ji', sources: ['search', 'map'] });
    const { rows: saves } = await harness.pool.query<{ user_id: string }>(
      "SELECT user_id FROM saved_items WHERE kind = 'poi' AND ref_id = $1",
      [temple],
    );
    expect(saves.map((row) => row.user_id).sort()).toEqual([first.uid, second.uid].sort());
    const { rows: hints } = await harness.pool.query(
      "SELECT 1 FROM rt_outbox WHERE channel = $1 AND payload->>'type' = 'ideas.changed'",
      [`trip_plan:${crew.tripId}`],
    );
    expect(hints.length).toBeGreaterThan(0);
  });

  it('keeps one idea when the whole crew saves a place at the same moment', async () => {
    const results = await Promise.all(
      [crew.organiser, ...crew.members.slice(1)].map((who) =>
        harness.run(who, 'save_idea', { trip_id: crew.tripId, poi_id: garden, source: 'swipe' }),
      ),
    );
    for (const result of results) expect(result.status, JSON.stringify(result.body)).toBe(200);
    const { rows } = await harness.pool.query<{ backer_ids: string[] }>(
      'SELECT backer_ids FROM trip_ideas WHERE trip_id = $1 AND poi_id = $2 AND deleted_at IS NULL',
      [crew.tripId, garden],
    );
    expect(rows).toHaveLength(1);
    expect([...rows[0]!.backer_ids].sort()).toEqual(crew.members.map((m) => m.uid).sort());
  });

  it('takes a place inside the destination box and refuses one outside it', async () => {
    const member = crew.members[1]!;
    const inside = await harness.run(member, 'save_idea', {
      trip_id: crew.tripId,
      poi_id: neighbour,
      source: 'link',
      source_url: 'https://www.tiktok.com/@someone/video/1',
    });
    expect(inside.status, JSON.stringify(inside.body)).toBe(200);
    const outside = await harness.run(member, 'save_idea', {
      trip_id: crew.tripId,
      poi_id: castle,
      source: 'search',
    });
    expect(errorOf(outside)).toMatchObject({
      code: 'VALIDATION',
      detail: { reason: 'outside_destination' },
    });
    const pinOutside = await harness.run(member, 'save_idea', {
      trip_id: crew.tripId,
      pin: { name: 'Dotonbori', lat: 34.6687, lng: 135.5013 },
      source: 'pin',
    });
    expect(errorOf(pinOutside)).toMatchObject({ code: 'VALIDATION' });
    const ideaId = generateUuidV7();
    const pin = await harness.run(member, 'save_idea', {
      idea_id: ideaId,
      trip_id: crew.tripId,
      pin: { name: 'Our ramen spot', lat: 35.0, lng: 135.75 },
      source: 'pin',
    });
    expect(pin.status, JSON.stringify(pin.body)).toBe(200);
    expect(resultOf<{ idea_id: string }>(pin).idea_id).toBe(ideaId);
    const { rows } = await harness.pool.query(
      'SELECT poi_id, category FROM trip_ideas WHERE id = $1',
      [ideaId],
    );
    expect(rows[0]).toEqual({ poi_id: null, category: 'other' });
  });

  it('answers NOT_FOUND to someone outside the crew', async () => {
    const denied = await harness.run(outsider, 'save_idea', {
      trip_id: crew.tripId,
      poi_id: temple,
      source: 'save',
    });
    expect(errorOf(denied).code).toBe('NOT_FOUND');
    const idea = (await ideas())[0]!;
    const removal = await harness.run(outsider, 'remove_idea', { idea_id: idea.id });
    expect(errorOf(removal).code).toBe('NOT_FOUND');
  });
});

describe('the ♡ on a place page and remove_idea', () => {
  it('backs the trip idea on save and leaves it on unsave, removing it with the last backer', async () => {
    const member = crew.members[2]!;
    const shrine = await poi(
      (
        await harness.pool.query<{ destination_id: string }>(
          'SELECT destination_id FROM trips WHERE id = $1',
          [crew.tripId],
        )
      ).rows[0]!.destination_id,
      'Kiyomizu-dera',
      34.9949,
      135.785,
    );
    const saved = await harness.run(member, 'save_place', { place_id: shrine });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    const { rows } = await harness.pool.query<{ backer_ids: string[]; sources: string[] }>(
      'SELECT backer_ids, sources FROM trip_ideas WHERE poi_id = $1 AND deleted_at IS NULL',
      [shrine],
    );
    expect(rows).toEqual([{ backer_ids: [member.uid], sources: ['save'] }]);
    const unsaved = await harness.run(member, 'unsave_place', { place_id: shrine });
    expect(unsaved.status, JSON.stringify(unsaved.body)).toBe(200);
    const { rows: live } = await harness.pool.query(
      'SELECT 1 FROM trip_ideas WHERE poi_id = $1 AND deleted_at IS NULL',
      [shrine],
    );
    expect(live).toHaveLength(0);
  });

  it('lets a backer leave, refuses a member who never backed it, and lets an organiser remove it', async () => {
    const [, first, second] = crew.members as [SignedIn, SignedIn, SignedIn];
    const idea = (await ideas()).find((row) => row.name === 'Kinkaku-ji')!;
    const left = await harness.run(first, 'remove_idea', { idea_id: idea.id });
    expect(resultOf(left)).toEqual({ idea_id: idea.id, removed: false, backer_ids: [second.uid] });
    const denied = await harness.run(first, 'remove_idea', { idea_id: idea.id });
    expect(errorOf(denied)).toMatchObject({ code: 'FORBIDDEN', detail: { reason: 'not_backer' } });
    const removed = await harness.run(crew.organiser, 'remove_idea', { idea_id: idea.id });
    expect(resultOf<{ removed: boolean }>(removed).removed).toBe(true);
    const saved = await harness.run(first, 'save_idea', {
      trip_id: crew.tripId,
      poi_id: temple,
      source: 'save',
    });
    expect(resultOf<{ idea_id: string }>(saved).idea_id).not.toBe(idea.id);
  });
});

describe('hide_place', () => {
  it('keeps a hide to its owner and lifts it on unhide', async () => {
    const [, first, second] = crew.members as [SignedIn, SignedIn, SignedIn];
    const hidden = await harness.run(first, 'hide_place', { poi_id: castle });
    expect(resultOf(hidden)).toEqual({ poi_id: castle, hidden: true });
    const twice = await harness.run(first, 'hide_place', { poi_id: castle });
    expect(twice.status).toBe(200);
    const { rows } = await harness.pool.query('SELECT user_id FROM place_hides WHERE poi_id = $1', [
      castle,
    ]);
    expect(rows).toEqual([{ user_id: first.uid }]);
    const missing = await harness.run(second, 'hide_place', { poi_id: generateUuidV7() });
    expect(errorOf(missing).code).toBe('NOT_FOUND');
    const shown = await harness.run(first, 'unhide_place', { poi_id: castle });
    expect(resultOf(shown)).toEqual({ poi_id: castle, hidden: false });
    const { rows: after } = await harness.pool.query(
      'SELECT 1 FROM place_hides WHERE poi_id = $1',
      [castle],
    );
    expect(after).toHaveLength(0);
    const { rows: events } = await harness.pool.query(
      "SELECT 1 FROM domain_events WHERE payload::text LIKE '%' || $1 || '%'",
      [castle],
    );
    expect(events).toHaveLength(0);
  });
});
