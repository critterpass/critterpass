/**
 * The critter-nearby activity the app starts itself, driven by an encounter engine snapshot and
 * an in-memory Live Activity module: ten ring steps for a full dwell, a drain that never resets,
 * found and gone endings, a start the system refused tried again, and nothing on a build that
 * cannot draw the kind.
 */
import { describe, expect, it } from '@jest/globals';

import {
  CRITTER_FOUND_LINGER_S,
  critterNearbyInput,
  runningCritterActivity,
  startCritterNearbyActivity,
  type NearbyPort,
  type RunningActivity,
  type NearbySnapshot,
} from '../critter-nearby';

const SPAWN = '0199a3c0-0000-7000-8000-00000000e001';
const ENCOUNTER = '0199a3c0-0000-7000-8000-00000000e0aa';
const NOW = 1_790_000_000_000;

/** An activity already on the lock screen, as the module lists it. */
const running = (id: string, key: string, state = 'active'): RunningActivity => ({
  id,
  kind: 'critter_nearby',
  attributes: { spawn_id: key, silhouette_key: 'gecko-tokek', place_name: 'Tirta Empul' },
  state,
});

const at = (phase: string, progress: number, band: string | null = '0_10'): NearbySnapshot => ({
  phase,
  progress,
  band,
  candidate: {
    rule: { id: SPAWN, form_id: 'gecko-tokek', dwell_s: 600 },
    spot: { name: 'Tirta Empul' },
  },
});

function world(
  options: {
    drawn?: readonly string[] | null;
    refuseStarts?: number;
    /** What the phone already shows; absent for a build that cannot list activities. */
    running?: () => readonly RunningActivity[];
  } = {},
) {
  let snapshot: NearbySnapshot = { phase: 'none', progress: 0, band: null, candidate: null };
  const listeners = new Set<() => void>();
  const calls: {
    op: string;
    id?: string;
    state?: Record<string, unknown>;
    dismissAt?: number;
  }[] = [];
  let refusals = options.refuseStarts ?? 0;
  const port: NearbyPort = {
    authorization: () => ({ enabled: true }),
    drawnKinds: () =>
      options.drawn === undefined ? ['leave_by', 'critter_nearby'] : options.drawn,
    start: (request) => {
      if (refusals > 0) {
        refusals -= 1;
        return Promise.reject(new Error('the app is not in front'));
      }
      calls.push({ op: 'start', state: { ...request.state, ...request.attributes } });
      return Promise.resolve('activity-1');
    },
    update: (request) => {
      calls.push({ op: 'update', id: request.id, state: { ...request.state } });
      return Promise.resolve();
    },
    end: (request) => {
      calls.push({
        op: 'end',
        id: request.id,
        ...(request.state === undefined ? {} : { state: { ...request.state } }),
        ...(request.dismissAt === undefined ? {} : { dismissAt: request.dismissAt }),
      });
      return Promise.resolve();
    },
  };
  if (options.running !== undefined) port.list = options.running;
  const settle = async () => {
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
  };
  const stop = startCritterNearbyActivity({
    source: {
      snapshot: () => snapshot,
      subscribe: (listener) => (listeners.add(listener), () => listeners.delete(listener)),
    },
    port,
    now: () => NOW,
  });
  return {
    calls,
    stop,
    settle,
    async move(next: NearbySnapshot) {
      // Let the driver's first look (nothing to show yet) finish before the engine moves.
      await settle();
      snapshot = next;
      listeners.forEach((listener) => listener());
      await settle();
    },
  };
}

describe('critter-nearby activity from the encounter engine', () => {
  it('fills the ring in ten steps over a full dwell, one frame per step', async () => {
    const w = world();
    // The engine ticks every second: 600 ticks of a ten-minute dwell.
    for (let second = 0; second <= 600; second += 1) {
      await w.move(at(second === 600 ? 'ready' : 'accruing', second / 600));
    }
    expect(w.calls[0]).toMatchObject({
      op: 'start',
      state: { spawn_id: SPAWN, place_name: 'Tirta Empul', ring: 0, remain_min: 10 },
    });
    const rings = w.calls.map((call) => call.state?.['ring']);
    expect([...new Set(rings)]).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    // A frame only when the ring or the minutes left move: far fewer than the 600 ticks.
    expect(w.calls.length).toBeLessThan(25);
    expect(w.calls.at(-1)?.state).toMatchObject({ ring: 10, blur_stage: 0, remain_min: null });
    expect(JSON.stringify(w.calls)).not.toMatch(/lat|lng/);
  });

  it('drains slowly when the traveller wanders off, without resetting', async () => {
    const w = world();
    await w.move(at('accruing', 0.62));
    await w.move(at('draining', 0.6, '50_plus'));
    await w.move(at('draining', 0.48, '50_plus'));
    expect(w.calls.map((call) => [call.op, call.state?.['state'], call.state?.['ring']])).toEqual([
      ['start', 'dwelling', 6],
      ['update', 'draining', 6],
      ['update', 'draining', 4],
    ]);
    expect(w.calls[1]?.state).toMatchObject({ distance_band: 'near', remain_min: null });
  });

  it('ends on the catch with the found critter, and stays a while', async () => {
    const w = world();
    await w.move(at('ready', 1));
    await w.move(at('befriended', 1));
    expect(w.calls.at(-1)).toMatchObject({
      op: 'end',
      state: { state: 'caught', ring: 10, found_key: 'gecko-tokek' },
      dismissAt: NOW / 1000 + CRITTER_FOUND_LINGER_S,
    });
    // The engine keeps the result until it is dismissed: nothing starts again for it.
    await w.move(at('befriended', 1));
    await w.move({ phase: 'none', progress: 0, band: null, candidate: null });
    expect(w.calls.filter((call) => call.op === 'start')).toHaveLength(1);
    expect(w.calls.filter((call) => call.op === 'end')).toHaveLength(1);
  });

  it('ends when the critter is gone', async () => {
    const w = world();
    await w.move(at('accruing', 0.3));
    await w.move(at('wandered_off', 0));
    expect(w.calls.at(-1)).toMatchObject({ op: 'end', state: { state: 'expired' } });
  });

  it('tries a refused start again on the next change', async () => {
    const w = world({ refuseStarts: 2 });
    await w.move(at('accruing', 0.1));
    await w.move(at('accruing', 0.2));
    expect(w.calls).toEqual([]);
    await w.move(at('accruing', 0.3));
    expect(w.calls).toMatchObject([{ op: 'start', state: { ring: 3 } }]);
  });

  it('never starts on a build whose widget extension does not draw it', async () => {
    for (const drawn of [null, ['leave_by', 'flight']]) {
      const w = world({ drawn });
      await w.move(at('accruing', 0.4));
      expect(w.calls).toEqual([]);
    }
  });

  it('ends what it started when the session stops', async () => {
    const w = world();
    await w.move(at('accruing', 0.4));
    w.stop();
    await w.settle();
    expect(w.calls.map((call) => call.op)).toEqual(['start', 'end']);
  });

  it('takes over the activity the server started by push instead of starting a second one', async () => {
    // The dwell began in the background: the phone refused the app's start, the server's push
    // started one under the encounter's id, and then the app came to the front.
    let shown: RunningActivity[] = [];
    const w = world({ refuseStarts: 3, running: () => shown });
    await w.move({ ...at('accruing', 0.2), encounterId: ENCOUNTER });
    expect(w.calls).toEqual([]);
    shown = [running('pushed-1', ENCOUNTER)];
    await w.move({ ...at('accruing', 0.45), encounterId: ENCOUNTER });
    await w.move({ ...at('accruing', 0.62), encounterId: ENCOUNTER });
    await w.move({ ...at('befriended', 1), encounterId: ENCOUNTER });
    expect(w.calls.map((call) => [call.op, call.id])).toEqual([
      ['update', 'pushed-1'],
      ['update', 'pushed-1'],
      ['end', 'pushed-1'],
    ]);
    expect(w.calls[0]?.state).toMatchObject({ state: 'dwelling', ring: 4 });
    expect(w.calls.at(-1)).toMatchObject({
      state: { state: 'caught', found_key: 'gecko-tokek' },
      dismissAt: NOW / 1000 + CRITTER_FOUND_LINGER_S,
    });
  });

  it('ends a push-started activity on the found art when the app opens after the catch', async () => {
    const w = world({ running: () => [running('pushed-1', ENCOUNTER)] });
    await w.move({ ...at('befriended', 1), encounterId: ENCOUNTER });
    expect(w.calls.map((call) => [call.op, call.id])).toEqual([['end', 'pushed-1']]);
  });

  it("leaves another encounter's activity alone and starts its own", async () => {
    const other = '0199a3c0-0000-7000-8000-00000000e0bb';
    const w = world({ running: () => [running('pushed-9', other)] });
    await w.move({ ...at('accruing', 0.3), encounterId: ENCOUNTER });
    expect(w.calls.map((call) => call.op)).toEqual(['start']);
  });

  it('picks the push-started activity first, then its own, and never one that is over', () => {
    const keys = { encounterId: ENCOUNTER, spawnId: SPAWN };
    const own = running('own-1', SPAWN);
    const pushed = running('pushed-1', ENCOUNTER, 'stale');
    expect(runningCritterActivity([own, pushed], keys)?.id).toBe('pushed-1');
    expect(runningCritterActivity([own], keys)?.id).toBe('own-1');
    expect(runningCritterActivity([own], { ...keys, encounterId: null })?.id).toBe('own-1');
    expect(runningCritterActivity([running('gone', ENCOUNTER, 'dismissed')], keys)).toBeNull();
    expect(runningCritterActivity([running('done', ENCOUNTER, 'ended')], keys)).toBeNull();
    expect(
      runningCritterActivity([{ ...pushed, kind: 'leave_by', state: 'active' }], keys),
    ).toBeNull();
  });

  it('has nothing to show before the ring starts filling', () => {
    expect(critterNearbyInput(at('idle', 0))).toBeNull();
    expect(
      critterNearbyInput({ phase: 'accruing', progress: 0.2, band: null, candidate: null }),
    ).toBeNull();
  });
});
