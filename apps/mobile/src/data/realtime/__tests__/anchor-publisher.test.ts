import { describe, expect, it } from '@jest/globals';

import { ANCHOR_INTERVAL_MS, createAnchorPublisher } from '../use-anchored-presence';

/** A manual clock and timer queue, so rates are measured exactly. */
function manualTime() {
  let now = 0;
  let timers: { at: number; callback: () => void }[] = [];
  return {
    now: () => now,
    setTimer: (callback: () => void, ms: number) => {
      const timer = { at: now + ms, callback };
      timers.push(timer);
      return timer;
    },
    clearTimer: (handle: unknown) => {
      timers = timers.filter((timer) => timer !== handle);
    },
    advanceTo(target: number) {
      for (;;) {
        const due = timers.filter((timer) => timer.at <= target).sort((a, b) => a.at - b.at)[0];
        if (due === undefined) break;
        timers = timers.filter((timer) => timer !== due);
        now = due.at;
        due.callback();
      }
      now = target;
    },
  };
}

describe('createAnchorPublisher', () => {
  it('sends at most 5 anchors a second, the latest one winning', () => {
    const time = manualTime();
    const sent: { at: number; anchor: string | null }[] = [];
    const publisher = createAnchorPublisher({
      publish: (anchor) => sent.push({ at: time.now(), anchor }),
      ...time,
    });
    // Scrolling across a plan: a new anchor every 16 ms for 1 s.
    for (let frame = 0; frame * 16 < 1000; frame += 1) {
      time.advanceTo(frame * 16);
      publisher.set(`plan_item:item${frame}`);
    }
    time.advanceTo(2000);

    expect(ANCHOR_INTERVAL_MS).toBeGreaterThanOrEqual(200);
    const gaps = sent.slice(1).map((entry, index) => entry.at - (sent[index]?.at ?? 0));
    expect(gaps.every((gap) => gap >= ANCHOR_INTERVAL_MS)).toBe(true);
    expect(sent.filter((entry) => entry.at < 1000).length).toBeLessThanOrEqual(5);
    expect(sent.at(-1)?.anchor).toBe('plan_item:item62');
  });

  it('clears the anchor on blur, respecting the window', () => {
    const time = manualTime();
    const sent: (string | null)[] = [];
    const publisher = createAnchorPublisher({ publish: (anchor) => sent.push(anchor), ...time });
    publisher.set('plan_item:a');
    time.advanceTo(50);
    publisher.set(null);
    expect(sent).toEqual(['plan_item:a']);
    time.advanceTo(ANCHOR_INTERVAL_MS - 1);
    expect(sent).toEqual(['plan_item:a']);
    time.advanceTo(ANCHOR_INTERVAL_MS);
    expect(sent).toEqual(['plan_item:a', null]);
  });

  it('does not resend an unchanged anchor until a resubscribe makes peers forget it', () => {
    const time = manualTime();
    const sent: (string | null)[] = [];
    const publisher = createAnchorPublisher({ publish: (anchor) => sent.push(anchor), ...time });
    publisher.set(null);
    publisher.set('plan_item:a');
    time.advanceTo(500);
    publisher.set('plan_item:a');
    expect(sent).toEqual(['plan_item:a']);
    publisher.forget();
    publisher.set('plan_item:a');
    expect(sent).toEqual(['plan_item:a', 'plan_item:a']);
  });

  it('resends a rejected latest anchor once, after the window', async () => {
    const time = manualTime();
    const sent: (string | null)[] = [];
    const publisher = createAnchorPublisher({
      publish: (anchor) => {
        sent.push(anchor);
        return Promise.reject(new Error('rate limited'));
      },
      ...time,
    });
    publisher.set('plan_item:a');
    await Promise.resolve();
    await Promise.resolve();
    time.advanceTo(ANCHOR_INTERVAL_MS);
    await Promise.resolve();
    await Promise.resolve();
    time.advanceTo(10 * ANCHOR_INTERVAL_MS);
    expect(sent).toEqual(['plan_item:a', 'plan_item:a']);
  });

  it('sends the newer anchor instead when one arrives while a resend is held', async () => {
    const time = manualTime();
    const sent: (string | null)[] = [];
    let reject = true;
    const publisher = createAnchorPublisher({
      publish: (anchor) => {
        sent.push(anchor);
        return reject ? Promise.reject(new Error('rate limited')) : Promise.resolve();
      },
      ...time,
    });
    publisher.set('plan_item:a');
    await Promise.resolve();
    await Promise.resolve();
    reject = false;
    publisher.set('plan_item:b');
    time.advanceTo(ANCHOR_INTERVAL_MS);
    expect(sent).toEqual(['plan_item:a', 'plan_item:b']);
  });
});
