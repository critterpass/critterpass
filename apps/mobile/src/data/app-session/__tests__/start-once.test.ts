/**
 * The shared session start: callers share one attempt, a success is kept, and after a failure
 * every caller gets it back until a growing cooldown has passed.
 */
import { describe, expect, it } from '@jest/globals';

import { START_COOLDOWN_MS, startOnce } from '../start-once';

function harness(outcomes: readonly ('ok' | 'fail')[]) {
  let clock = 0;
  let attempts = 0;
  const start = startOnce(
    () => {
      const outcome = outcomes[Math.min(attempts, outcomes.length - 1)];
      attempts += 1;
      return outcome === 'ok'
        ? Promise.resolve(`session-${attempts}`)
        : Promise.reject(new Error(`attempt ${attempts} failed`));
    },
    () => clock,
  );
  return {
    start,
    attempts: () => attempts,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

describe('startOnce', () => {
  it('shares one attempt between callers and keeps the session', async () => {
    const h = harness(['ok']);
    const [a, b] = await Promise.all([h.start(), h.start()]);
    expect([a, b]).toEqual(['session-1', 'session-1']);
    await expect(h.start()).resolves.toBe('session-1');
    expect(h.attempts()).toBe(1);
  });

  it('answers every caller with the last failure until the cooldown has passed', async () => {
    const h = harness(['fail', 'fail', 'ok']);
    await expect(h.start()).rejects.toThrow('attempt 1 failed');
    for (let caller = 0; caller < 10; caller += 1) {
      await expect(h.start()).rejects.toThrow('attempt 1 failed');
    }
    expect(h.attempts()).toBe(1);

    h.advance(START_COOLDOWN_MS[0]);
    await expect(h.start()).rejects.toThrow('attempt 2 failed');
    h.advance(START_COOLDOWN_MS[0]);
    await expect(h.start()).rejects.toThrow('attempt 2 failed');
    expect(h.attempts()).toBe(2);

    h.advance(START_COOLDOWN_MS[1]);
    await expect(h.start()).resolves.toBe('session-3');
    expect(h.attempts()).toBe(3);
  });
});
