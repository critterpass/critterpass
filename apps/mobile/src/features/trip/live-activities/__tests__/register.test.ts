/**
 * What reaches the server from ActivityKit: push-to-start tokens, update tokens and activity states
 * (a dismissal included), once each between rounds; everything again on the next launch, a minute
 * after launch and on a return to the foreground, because a queued command the server refused is
 * never heard of again; and nothing while Live Activities are off. The OS side is an in-memory
 * module that emits the events the Swift relay would.
 */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import type { RegisterLaTokenPayload, ReportLaStatePayload } from '@cp/domain';

import type { LaDeviceActivity, LaPort } from '../la-port';
import {
  LA_RESEND_AFTER_LAUNCH_MS,
  LA_RESEND_INTERVAL_MS,
  startLaRegistration,
  type LaSendOutcome,
} from '../register';

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
    drawnKinds: () => null,
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

function harness(
  options: { enabled?: boolean; outcome?: string; store?: Map<string, string> } = {},
) {
  const module = fakeModule(options.enabled ?? true);
  const tokens: RegisterLaTokenPayload[] = [];
  const states: ReportLaStatePayload[] = [];
  const store = options.store ?? new Map<string, string>();
  const foreground: (() => void)[] = [];
  let outcome = options.outcome ?? 'queued';
  let clock = 1_000_000;
  const answer = (): Promise<LaSendOutcome> => Promise.resolve({ kind: outcome });
  const stop = startLaRegistration({
    port: module.port,
    apnsEnv: () => Promise.resolve('prod'),
    registerToken: (payload) => (tokens.push(payload), answer()),
    reportState: (payload) => (states.push(payload), answer()),
    storage: {
      getString: (key) => store.get(key),
      set: (key, value) => void store.set(key, value),
    },
    onForeground: (listener) => {
      foreground.push(listener);
      return () => void foreground.splice(foreground.indexOf(listener), 1);
    },
    now: () => clock,
  });
  const settle = async () => {
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
  };
  return {
    ...module,
    tokens,
    states,
    store,
    stop,
    settle,
    setOutcome: (next: string) => (outcome = next),
    /** The app comes back to the foreground `ms` later. */
    foregroundAfter: (ms: number) => {
      clock += ms;
      foreground.forEach((listener) => listener());
    },
    emitStart: (token: string) =>
      module.listeners.start.forEach((l) => l({ kind: 'leave_by', token })),
  };
}

const startPayload = (token: string) => ({
  kind: 'push_to_start',
  activity_type: 'leave_by',
  token,
  apns_env: 'prod',
});

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('Live Activity registration', () => {
  it('sends a push-to-start token once until something calls for it again', async () => {
    const h = harness();
    h.emitStart(TOKEN);
    await h.settle();
    h.emitStart(TOKEN);
    await h.settle();
    expect(h.tokens).toEqual([startPayload(TOKEN)]);
    h.emitStart('cd'.repeat(32));
    await h.settle();
    expect(h.tokens).toEqual([startPayload(TOKEN), startPayload('cd'.repeat(32))]);
  });

  it('sends a registration the server refused again on the next launch', async () => {
    // First launch: iOS hands the token out once; the command is queued, then refused server-side.
    const first = harness();
    first.emitStart(TOKEN);
    await first.settle();
    first.stop();
    expect(first.tokens).toEqual([startPayload(TOKEN)]);

    // Next launch: iOS says nothing new, and the token still goes out, from the phone's own copy.
    const second = harness({ store: first.store });
    await second.settle();
    expect(second.tokens).toEqual([startPayload(TOKEN)]);
  });

  it('sends everything again a minute after launch and on a later return to the foreground', async () => {
    const h = harness();
    h.emitStart(TOKEN);
    h.listeners.state.forEach((l) => l({ ...leaveBy, state: 'active' }));
    await h.settle();
    expect([h.tokens.length, h.states.length]).toEqual([1, 1]);

    jest.advanceTimersByTime(LA_RESEND_AFTER_LAUNCH_MS);
    await h.settle();
    expect([h.tokens.length, h.states.length]).toEqual([2, 2]);

    h.foregroundAfter(LA_RESEND_INTERVAL_MS - 1);
    await h.settle();
    expect(h.tokens).toHaveLength(2);
    h.foregroundAfter(1);
    await h.settle();
    expect([h.tokens.length, h.states.length]).toEqual([3, 3]);
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
        apns_env: 'prod',
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

  it('sends nothing while Live Activities are off, and keeps the token for when they are on', async () => {
    const h = harness({ enabled: false });
    h.emitStart(TOKEN);
    h.listeners.update.forEach((l) => l({ ...leaveBy, token: TOKEN }));
    h.listeners.state.forEach((l) => l({ ...leaveBy, state: 'active' }));
    await h.settle();
    expect(h.tokens).toEqual([]);
    expect(h.states).toEqual([]);

    h.auth.enabled = true;
    h.foregroundAfter(LA_RESEND_INTERVAL_MS);
    await h.settle();
    expect(h.tokens.map((t) => t.kind).sort()).toEqual(['push_to_start', 'update']);
    expect(h.states).toHaveLength(1);
  });

  it('tries a send that did not reach the queue again on the next report', async () => {
    const h = harness({ outcome: 'unavailable' });
    h.emitStart(TOKEN);
    await h.settle();
    h.setOutcome('queued');
    h.emitStart(TOKEN);
    await h.settle();
    h.emitStart(TOKEN);
    await h.settle();
    expect(h.tokens).toHaveLength(2);
  });

  it('ignores activities whose attributes name no object, and stops on unsubscribe', async () => {
    const h = harness();
    h.listeners.state.forEach((l) => l({ ...leaveBy, attributes: {}, state: 'active' }));
    h.stop();
    expect(h.listeners.start).toHaveLength(0);
    jest.advanceTimersByTime(LA_RESEND_AFTER_LAUNCH_MS);
    h.foregroundAfter(LA_RESEND_INTERVAL_MS);
    await h.settle();
    expect(h.states).toEqual([]);
    expect(h.tokens).toEqual([]);
  });
});
