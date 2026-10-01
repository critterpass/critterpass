/**
 * Saving on the real stack: `save_place` keeps today's destination payload working and saves a
 * place page's POI as kind `poi`, into a named list when asked (created on first use, even from
 * the offline queue, replayed once); the list commands create idempotently, rename with their
 * items, move one item, and delete back to "Saved". Everything stays the caller's own.
 */
import { generateUuidV7 } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerPollCommands } from '../../src/commands/polls';
import { errorOf, resultOf } from '../setup/setup-harness';
import { startExploreWorld, type ExploreWorld } from './explore-world';

let world: ExploreWorld;

beforeAll(async () => {
  world = await startExploreWorld(registerPollCommands);
}, 240_000);

afterAll(async () => {
  await world?.harness.stop();
});

const saved = (uid: string) =>
  world.q<{ id: string; kind: string; ref_id: string; list_name: string | null }>(
    'SELECT id, kind, ref_id, list_name FROM saved_items WHERE user_id = $1 ORDER BY created_at',
    [uid],
  );
const lists = (uid: string) =>
  world.q<{ name: string }>('SELECT name FROM saved_lists WHERE user_id = $1 ORDER BY position', [
    uid,
  ]);

describe('save_place', () => {
  it('saves a destination with the payload the app sends today, and a POI into a list', async () => {
    const me = world.a.organiser;
    const run = world.harness.run.bind(world.harness);
    expect((await run(me, 'save_place', { place_id: world.kyoto })).status).toBe(200);
    const opId = generateUuidV7();
    const payload = { place_id: world.pois.mustSee, list_name: 'Kyoto temples' };
    expect(resultOf(await run(me, 'save_place', payload, { opId }))).toEqual({
      place_id: world.pois.mustSee,
      saved: true,
    });
    await run(me, 'save_place', payload, { opId });
    expect((await saved(me.uid)).map((row) => [row.kind, row.list_name])).toEqual([
      ['place', null],
      ['poi', 'Kyoto temples'],
    ]);
    expect(await lists(me.uid)).toEqual([{ name: 'Kyoto temples' }]);
    expect(errorOf(await run(me, 'save_place', { place_id: generateUuidV7() })).code).toBe(
      'NOT_FOUND',
    );

    expect((await run(me, 'unsave_place', { place_id: world.pois.mustSee })).status).toBe(200);
    expect((await saved(me.uid)).map((row) => row.kind)).toEqual(['place']);
    expect(await saved(world.a.members[1]!.uid)).toEqual([]);
  });
});

describe('saved lists', () => {
  it('creates idempotently, renames with its items, moves one and deletes back to Saved', async () => {
    const me = world.a.members[1]!;
    const run = (cmd: string, payload: unknown) => world.harness.run(me, cmd, payload);
    const listId = generateUuidV7();
    const created = resultOf<{ id: string }>(
      await run('create_saved_list', { list_id: listId, name: 'Food' }),
    );
    expect(created.id).toBe(listId);
    expect(resultOf<{ id: string }>(await run('create_saved_list', { name: 'Food' })).id).toBe(
      listId,
    );

    await run('save_place', { place_id: world.pois.picks[1], list_name: 'Food' });
    await run('save_place', { place_id: world.pois.picks[0] });
    expect(
      errorOf(await run('rename_saved_list', { list_id: listId, name: 'Food' })).code,
    ).toBeUndefined();
    await run('create_saved_list', { name: 'Temples' });
    expect(
      errorOf(await run('rename_saved_list', { list_id: listId, name: 'Temples' })),
    ).toMatchObject({
      code: 'STATE_INVALID',
      detail: { reason: 'list_name_taken' },
    });
    await run('rename_saved_list', { list_id: listId, name: 'Eats' });
    const items = await saved(me.uid);
    expect(items.map((row) => row.list_name)).toEqual(['Eats', null]);

    await run('move_saved_item', { item_id: items[1]!.id, list_name: 'Temples' });
    expect((await saved(me.uid)).map((row) => row.list_name)).toEqual(['Eats', 'Temples']);

    expect(resultOf(await run('delete_saved_list', { list_id: listId }))).toEqual({
      list_id: listId,
      deleted: true,
    });
    expect((await saved(me.uid)).map((row) => row.list_name)).toEqual([null, 'Temples']);
    expect(await lists(me.uid)).toEqual([{ name: 'Temples' }]);

    const other = world.a.organiser;
    expect(
      errorOf(
        await world.harness.run(other, 'move_saved_item', {
          item_id: items[0]!.id,
          list_name: null,
        }),
      ).code,
    ).toBe('NOT_FOUND');
  });
});
