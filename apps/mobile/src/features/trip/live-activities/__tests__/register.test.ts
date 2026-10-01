/**
 * What reaches the server from ActivityKit: each push-to-start token and update token once, each
 * activity state once (a dismissal included), nothing while Live Activities are off, and a send
 * that failed goes again on the next report. The OS side is an in-memory module that emits the
 * events the Swift relay would.
 */
import { describe, expect, it } from '@jest/globals';

import type { RegisterLaTokenPayload, ReportLaStatePayload } from '@cp/domain';

import type { LaDeviceActivity, LaPort } from '../la-port';
import { startLaRegistration, type LaSendOutcome } from '../register';

const LEAVE_BY = '0199a3c0-0000-7000-8000-00000000b001';
const TRIP = '0199a3c0-0000-7000-8000-00000000a001';
const ACTIVITY = '5B2F1C0E-8D6A-4F0B-9E3C-1A2B3C4D5E6F';
const TOKEN = 'ab'.repeat(32);

type Listener<E> = (event: E) => void;

function fakeModule(enabled = true) {
  const listeners = {
    start: [] as Listener<{ kind: 'leave_by'; token: string }>[],
    update: [] as Listener<LaDeviceActivity & { token: string }>[],
    state: [] as Listener<
      LaDeviceActivity & { state: 'active' | 'stale' | 'ended' | 'dismissed' }
    >[],
  };
  const auth = { enabled, frequent: false };
  const sub = <E>(list: Listener<E>[], listener: Listener<E>) => {
    list.push(listener);
    return { remove: () => list.splice(list.indexOf(listener), 1) };
  };
  const port = {
    authorization: () => auth,
    onPushToStartToken: (l: Listener<{ kind: 'leave_by'; token: string }>) =>
      sub(listeners.start, l),
    onUpdateToken: (l: Listener<LaDeviceActivity & { token: string }>) => sub(listeners.update, l),
    onActivityState: (l: (typeof listeners.state)[number]) => sub(listeners.state, l),
  } as unknown as LaPort;
  return { port, listeners, auth };
}

const leaveBy: LaDeviceActivity = {
  id: ACTIVITY,
  kind: 'leave_by',
  attributes: { trip_id: TRIP, leave_by_id: LEAVE_BY, title: 'Batur', legs: ['Villa', 'Summit'] },
};

function harness(options: { enabled?: boolean; outcome?: string } = {}) {
  const module = fakeModule(options.enabled ?? true);
  const tokens: RegisterLaTokenPayload[] = [];
  const states: ReportLaStatePayload[] = [];
  const store = new Map<string, string>();
  let outcome = options.outcome ?? 'queued';
  const answer = (): Promise<LaSendOutcome> => Promise.resolve({ kind: outcome });
  const stop = startLaRegistration({
    port: module.port,
    apnsEnv: () => Promise.resolve('sandbox'),
    registerToken: (payload) => (tokens.push(payload), answer()),
    reportState: (payload) => (states.push(payload), answer()),
    storage: {
      getString: (key) => store.get(key),
      set: (key, value) => void store.set(key, value),
    },
  });
  const settle = () => new Promise((resolve) => setImmediate(resolve));
  return {
    ...module,
    tokens,
    states,
    stop,
    settle,
    setOutcome: (next: string) => (outcome = next),
  };
}

describe('Live Activity registration', () => {
  it('registers each push-to-start token once', async () => {
    const h = harness();
    h.listeners.start.forEach((l) => l({ kind: 'leave_by', token: TOKEN }));
    await h.settle();
    h.listeners.start.forEach((l) => l({ kind: 'leave_by', token: TOKEN }));
    await h.settle();
    expect(h.tokens).toEqual([
      { kind: 'push_to_start', activity_type: 'leave_by', token: TOKEN, apns_env: 'sandbox' },
    ]);
    h.listeners.start.forEach((l) => l({ kind: 'leave_by', token: 'cd'.repeat(32) }));
    await h.settle();
    expect(h.tokens).toHaveLength(2);
  });

  it('binds an update token to the activity and the object it shows', async () => {
    const h = harness();
    h.listeners.update.forEach((l) => l({ ...leaveBy, token: TOKEN }));
    await h.settle();
    expect(h.tokens).toEqual([
      {
        kind: 'update',
        activity_type: 'leave_by',
        token: TOKEN,
        apns_env: 'sandbox',
        activity_id: ACTIVITY,
        ref_id: LEAVE_BY,
        started_via: 'local',
      },
    ]);
  });

  it('reports each state once, a dismissal included', async () => {
    const h = harness();
    for (const state of ['active', 'active', 'dismissed', 'dismissed'] as const) {
      h.listeners.state.forEach((l) => l({ ...leaveBy, state }));
      await h.settle();
    }
    expect(h.states.map((s) => s.state)).toEqual(['active', 'dismissed']);
    expect(h.states[1]).toMatchObject({
      activity_id: ACTIVITY,
      kind: 'leave_by',
      ref_id: LEAVE_BY,
    });
  });

  it('sends nothing while Live Activities are off for the app', async () => {
    const h = harness({ enabled: false });
    h.listeners.start.forEach((l) => l({ kind: 'leave_by', token: TOKEN }));
    h.listeners.update.forEach((l) => l({ ...leaveBy, token: TOKEN }));
    h.listeners.state.forEach((l) => l({ ...leaveBy, state: 'active' }));
    await h.settle();
    expect(h.tokens).toEqual([]);
    expect(h.states).toEqual([]);
  });

  it('tries a send the server turned away again on the next report', async () => {
    const h = harness({ outcome: 'unavailable' });
    h.listeners.start.forEach((l) => l({ kind: 'leave_by', token: TOKEN }));
    await h.settle();
    h.setOutcome('queued');
    h.listeners.start.forEach((l) => l({ kind: 'leave_by', token: TOKEN }));
    await h.settle();
    h.listeners.start.forEach((l) => l({ kind: 'leave_by', token: TOKEN }));
    await h.settle();
    expect(h.tokens).toHaveLength(2);
  });

  it('ignores activities whose attributes name no object, and stops on unsubscribe', async () => {
    const h = harness();
    h.listeners.state.forEach((l) => l({ ...leaveBy, attributes: {}, state: 'active' }));
    h.stop();
    expect(h.listeners.start).toHaveLength(0);
    await h.settle();
    expect(h.states).toEqual([]);
  });
});
