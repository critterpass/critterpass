/**
 * A step of a draft planned in day groups that stopped mid-way resumes at the group it stopped on:
 * the groups that finished are kept and not asked again, and the step fails until every group has
 * a result.
 */
import { describe, expect, it } from 'vitest';

import { eachGroup, type GroupProgress } from '../../../../src/jobs/ai/draft/group-progress';

/** Progress kept in memory the way the job row keeps it: as stored JSON, by group position. */
function memoryProgress(): GroupProgress & { readonly stored: Map<number, string> } {
  const stored = new Map<number, string>();
  return {
    stored,
    read: <T>() =>
      Promise.resolve(new Map([...stored].map(([index, json]) => [index, JSON.parse(json) as T]))),
    keep: (index, result) => {
      stored.set(index, JSON.stringify(result));
      return Promise.resolve();
    },
  };
}

describe('a step run per day group', () => {
  it('keeps the groups that finished when another fails, then redoes only that one', async () => {
    const progress = memoryProgress();
    const asked: number[] = [];
    const flaky = (failing: boolean) => (index: number) => {
      asked.push(index);
      return index === 1 && failing
        ? Promise.reject(new Error('the guide did not answer'))
        : Promise.resolve({ days: [`group ${index}`] });
    };

    await expect(eachGroup(3, progress, flaky(true))).rejects.toThrow('the guide did not answer');
    expect([...progress.stored.keys()].sort()).toEqual([0, 2]);

    asked.length = 0;
    const resumed = await eachGroup(3, progress, flaky(false));
    expect(asked).toEqual([1]);
    expect(resumed).toEqual([{ days: ['group 0'] }, { days: ['group 1'] }, { days: ['group 2'] }]);
  });

  it('runs every group when nothing was kept, and keeps nothing without a place to keep it', async () => {
    const asked: number[] = [];
    const results = await eachGroup(2, undefined, (index) => {
      asked.push(index);
      return Promise.resolve(index * 10);
    });
    expect(results).toEqual([0, 10]);
    expect(asked).toEqual([0, 1]);
  });
});
