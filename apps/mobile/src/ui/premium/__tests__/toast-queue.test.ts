import { describe, expect, it } from '@jest/globals';

import { dropToast, MAX_STACKED_TOASTS, pushToast, toastHold } from '../feedback/toast-queue';
import type { QueuedToast } from '../feedback/toast-queue';

const done = (id: number, message: string): QueuedToast => ({
  id,
  spec: { kind: 'done', message },
});

describe('toast stack', () => {
  it('stacks newest last and lets the oldest go past the limit', () => {
    let queue: readonly QueuedToast[] = [];
    for (let i = 1; i <= MAX_STACKED_TOASTS + 1; i += 1) {
      queue = pushToast(queue, done(i, `Saved ${String(i)}`));
    }
    expect(queue.map((q) => q.id)).toEqual([2, 3, 4]);
  });

  it('replaces a toast that says the same thing instead of stacking it twice', () => {
    const queue = pushToast(pushToast([], done(1, 'Added to Day 2')), done(2, 'Added to Day 2'));
    expect(queue.map((q) => q.id)).toEqual([2]);
  });

  it('drops a dismissed toast only', () => {
    const queue = [done(1, 'a'), done(2, 'b')];
    expect(dropToast(queue, 1).map((q) => q.id)).toEqual([2]);
  });

  it('keeps an error up twice as long', () => {
    expect(toastHold({ kind: 'error', message: 'Couldn’t reach it' }, 4000)).toBe(8000);
    expect(toastHold({ kind: 'done', message: 'Saved' }, 4000)).toBe(4000);
  });
});
