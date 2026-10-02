/**
 * The sticker draw queue: a 20-sticker grid never draws more than one sticker in a task, stickers
 * on screen draw before those below the fold, a sticker that unmounts is never drawn (unless
 * another still shows the same picture), and once nothing waits no task stays scheduled.
 */
import { describe, expect, it } from '@jest/globals';

import { CancelledDraw, DrawQueue, type TaskScheduler } from '../draw-queue';

/** A scheduler the test runs by hand, one task at a time. */
function manualTasks() {
  const tasks: (() => void)[] = [];
  const schedule: TaskScheduler = (task) => {
    tasks.push(task);
    return () => {
      const at = tasks.indexOf(task);
      if (at >= 0) tasks.splice(at, 1);
    };
  };
  return {
    schedule,
    pending: () => tasks.length,
    runOne: () => tasks.shift()?.(),
  };
}

describe('sticker draw queue', () => {
  it('draws a 20-sticker grid one sticker per task, on-screen stickers first', async () => {
    const tasks = manualTasks();
    const queue = new DrawQueue<string>(tasks.schedule);
    const drawn: string[] = [];
    const results: Promise<string>[] = [];
    for (let i = 0; i < 20; i += 1) {
      const key = `critter-${i}`;
      // Rows of four on a screen that shows the first two rows; the rest are below the fold.
      const priority = i < 8 ? 0 : 100 * Math.floor(i / 4);
      results.push(
        queue.request(
          key,
          () => {
            drawn.push(key);
            return key;
          },
          priority,
        ).result,
      );
    }
    // Nothing is drawn while the screen renders.
    expect(drawn).toEqual([]);
    for (let task = 1; task <= 20; task += 1) {
      expect(tasks.pending()).toBe(1);
      tasks.runOne();
      // Never more than one sticker's draw in one task.
      expect(drawn).toHaveLength(task);
    }
    expect(tasks.pending()).toBe(0);
    expect(drawn.slice(0, 8).sort()).toEqual(
      Array.from({ length: 8 }, (_, i) => `critter-${i}`).sort(),
    );
    expect(await Promise.all(results)).toEqual(
      Array.from({ length: 20 }, (_, i) => `critter-${i}`),
    );
  });

  it('moves a sticker up when it scrolls on screen', () => {
    const tasks = manualTasks();
    const queue = new DrawQueue<string>(tasks.schedule);
    const drawn: string[] = [];
    const draw = (key: string) => () => {
      drawn.push(key);
      return key;
    };
    queue.request('top', draw('top'), 0);
    const below = queue.request('below', draw('below'), 900);
    queue.request('middle', draw('middle'), 400);
    below.prioritise(0);
    tasks.runOne();
    tasks.runOne();
    tasks.runOne();
    expect(drawn).toEqual(['top', 'below', 'middle']);
  });

  it('never draws a sticker that unmounted, and stops scheduling once nothing waits', async () => {
    const tasks = manualTasks();
    const queue = new DrawQueue<string>(tasks.schedule);
    let draws = 0;
    const request = queue.request(
      'gone',
      () => {
        draws += 1;
        return 'gone';
      },
      0,
    );
    expect(tasks.pending()).toBe(1);
    request.cancel();
    await expect(request.result).rejects.toBeInstanceOf(CancelledDraw);
    expect(queue.size).toBe(0);
    expect(tasks.pending()).toBe(0);
    expect(draws).toBe(0);
  });

  it('still draws a picture another sticker shows when one of them unmounts', async () => {
    const tasks = manualTasks();
    const queue = new DrawQueue<string>(tasks.schedule);
    let draws = 0;
    const draw = () => {
      draws += 1;
      return 'shared';
    };
    const first = queue.request('shared', draw, 0);
    const second = queue.request('shared', draw, 0);
    first.cancel();
    await expect(first.result).rejects.toBeInstanceOf(CancelledDraw);
    tasks.runOne();
    expect(await second.result).toBe('shared');
    expect(draws).toBe(1);
  });
});
