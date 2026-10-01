import { describe, expect, it } from '@jest/globals';

import { createServerClock, planReveal, revealDelay } from '../server-clock';

/** A phone whose clock runs `skewMs` ahead of the server's, receiving messages after `transitMs`. */
function phone(skewMs: number) {
  const clock = createServerClock();
  return {
    clock,
    local: (serverMs: number) => serverMs + skewMs,
    receive(serverWrittenMs: number, transitMs: number) {
      clock.observe(new Date(serverWrittenMs).toISOString(), serverWrittenMs + transitMs + skewMs);
    },
  };
}

describe('server clock', () => {
  const server = Date.parse('2026-10-03T01:00:00.000Z');

  it('fires a shared reveal within 100 ms of reveal_at on phones with skewed clocks', () => {
    const revealAt = new Date(server + 1_500).toISOString();
    for (const skew of [-4_000, -120, 0, 950, 3_000]) {
      const p = phone(skew);
      // Earlier hints on the channel, then the reward itself, each with its own transit.
      p.receive(server - 60_000, 240);
      p.receive(server - 20_000, 60);
      p.receive(server, 310);
      const nowLocal = p.local(server + 310);
      const { delayMs, late } = revealDelay(p.clock, revealAt, nowLocal);
      const firesAtServer = nowLocal + delayMs - skew;
      expect(late).toBe(false);
      expect(Math.abs(firesAtServer - (server + 1_500))).toBeLessThanOrEqual(100);
    }
  });

  it('reveals a late opener at once, marked late so it shows without the spin', () => {
    const p = phone(0);
    p.receive(server, 50);
    expect(revealDelay(p.clock, new Date(server - 60_000).toISOString(), server + 50)).toEqual({
      delayMs: 0,
      late: true,
    });
  });

  it('forgets samples older than half an hour', () => {
    const p = phone(0);
    p.receive(server, 5_000);
    expect(p.clock.offset(server + 5_000)).toBe(-5_000);
    expect(p.clock.offset(server + 5_000 + 31 * 60_000)).toBe(0);
  });

  it('spins the reward at the moment, or shows it static with the haptic under Reduce Motion', () => {
    const p = phone(0);
    p.receive(server, 80);
    const revealAt = new Date(server + 1_500).toISOString();
    expect(planReveal(p.clock, revealAt, server + 80, false)).toMatchObject({
      mode: 'spin',
      haptic: true,
    });
    expect(planReveal(p.clock, revealAt, server + 80, true)).toMatchObject({
      mode: 'static',
      haptic: true,
    });
    const long = new Date(server - 120_000).toISOString();
    expect(planReveal(p.clock, long, server + 80, false)).toEqual({
      delayMs: 0,
      mode: 'static',
      haptic: false,
    });
  });
});
