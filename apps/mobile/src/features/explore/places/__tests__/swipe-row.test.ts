/**
 * Swiping a places list row: how far or how fast a drag must go to save or hide, the row's new
 * standing laid over the synced places until they show it, undo putting the row back with the
 * opposite command, and both commands waiting in the offline queue on a real local database.
 */
import { afterEach, describe, expect, it } from '@jest/globals';

import { removeDir } from '@/data/powersync/test-support/open-node-database';
import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { listQueuedCommands } from '@/data/status/use-queued-commands';

import { PLACES_COMMANDS } from '../commands';
import type { HubPlace } from '../places-model';
import {
  actionCommand,
  overlayPending,
  settlePending,
  swipeOutcome,
  undoCommand,
  withoutPending,
  withPending,
  type Pending,
  type PendingAction,
} from '../swipe-actions';

const TRIP = '0190f5a4-0000-7000-8000-00000000a001';
const TIRTA = '0190f5a4-0000-7000-8000-00000000b001';
const IDEA = '0190f5a4-0000-7000-8000-00000000c001';
const ME = '0190f5a4-0000-7000-8000-00000000d001';

const place = (standing: HubPlace['standing'], id = TIRTA): HubPlace => ({
  id,
  poiId: id,
  ideaId: null,
  name: 'Tirta Empul',
  category: 'temple_shrine',
  lat: -8.415,
  lng: 115.315,
  standing,
  backerIds: [],
  dayNo: null,
  mustSee: false,
  hours: null,
  bestTime: null,
});

describe('how far a drag must go', () => {
  const width = 360;
  it('acts past a third of the row, right to save and left to hide', () => {
    expect(swipeOutcome(130, 0, width)).toBe('save');
    expect(swipeOutcome(-130, 0, width)).toBe('hide');
  });

  it('springs back from a short slow drag', () => {
    expect(swipeOutcome(100, 200, width)).toBeNull();
    expect(swipeOutcome(-100, -200, width)).toBeNull();
  });

  it('acts on a quick flick, but not one against the drag or too short', () => {
    expect(swipeOutcome(60, 1200, width)).toBe('save');
    expect(swipeOutcome(-60, -1200, width)).toBe('hide');
    expect(swipeOutcome(60, -1200, width)).toBeNull();
    expect(swipeOutcome(30, 1500, width)).toBeNull();
  });

  it('reads the other way round in a right-to-left language', () => {
    expect(swipeOutcome(-130, 0, width, true)).toBe('save');
    expect(swipeOutcome(130, 0, width, true)).toBe('hide');
  });
});

describe('the row while its command waits', () => {
  const save: PendingAction = { action: 'save', poiId: TIRTA, ideaId: IDEA };
  const hide: PendingAction = { action: 'hide', poiId: TIRTA, ideaId: null };

  it('shows a save as saved by me at once, and undo puts the suggestion back', () => {
    const pending = withPending(new Map(), save);
    const [saved] = overlayPending([place('suggested')], pending, ME);
    expect(saved).toMatchObject({ standing: 'saved', ideaId: IDEA, backerIds: [ME] });
    const undone = withoutPending(pending, TIRTA);
    expect(overlayPending([place('suggested')], undone, ME)).toEqual([place('suggested')]);
  });

  it('takes a hidden row out at once, and undo brings it back', () => {
    const pending = withPending(new Map(), hide);
    expect(overlayPending([place('suggested')], pending, ME)).toEqual([]);
    expect(overlayPending([place('suggested')], withoutPending(pending, TIRTA), ME)).toHaveLength(
      1,
    );
  });

  it('never moves a place that is in the plan', () => {
    const pending = withPending(new Map(), hide);
    expect(overlayPending([place('plan')], pending, ME)).toEqual([place('plan')]);
  });

  it('steps aside once the synced places show the action', () => {
    const pending: Pending = withPending(withPending(new Map(), save), {
      ...hide,
      poiId: IDEA,
    });
    const settled = settlePending(pending, [place('saved'), place('suggested', IDEA)]);
    expect([...settled.keys()]).toEqual([IDEA]);
    expect(settlePending(settled, [place('saved')]).size).toBe(0);
  });

  it('sends the command for each action and its opposite for undo', () => {
    expect(actionCommand(TRIP, save)).toEqual({
      name: 'save_idea',
      payload: { trip_id: TRIP, poi_id: TIRTA, source: 'save', idea_id: IDEA },
    });
    expect(undoCommand(save)).toEqual({ name: 'remove_idea', payload: { idea_id: IDEA } });
    expect(actionCommand(TRIP, hide)).toEqual({ name: 'hide_place', payload: { poi_id: TIRTA } });
    expect(undoCommand(hide)).toEqual({ name: 'unhide_place', payload: { poi_id: TIRTA } });
  });
});

describe('without signal', () => {
  let stack: TestLocalFirst | undefined;

  afterEach(async () => {
    if (stack === undefined) return;
    await stack.close();
    removeDir(stack.dir);
    stack = undefined;
  });

  it('queues a save, a hide and their undos for the first bar', async () => {
    stack = await openTestLocalFirst({ holdUploads: true });
    const calls = [
      actionCommand(TRIP, { action: 'save', poiId: TIRTA, ideaId: IDEA }),
      undoCommand({ action: 'save', poiId: TIRTA, ideaId: IDEA }),
      actionCommand(TRIP, { action: 'hide', poiId: TIRTA, ideaId: null }),
      undoCommand({ action: 'hide', poiId: TIRTA, ideaId: null }),
    ];
    for (const call of calls) {
      if (call === null) throw new Error('every action here has an undo');
      const result = await stack.value.commands.send(PLACES_COMMANDS[call.name], call.payload);
      expect(result.kind).toBe('queued');
    }
    const queued = await listQueuedCommands(stack.db);
    expect(queued.map((entry) => entry.status)).toEqual(['queued', 'queued', 'queued', 'queued']);
    expect(queued.map((entry) => entry.summary.id)).toEqual([
      'places.queued.save',
      'places.queued.remove',
      'places.queued.hide',
      'places.queued.unhide',
    ]);
  });
});
