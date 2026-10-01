import { describe, expect, it } from '@jest/globals';

import { checkForUpdateNow, type CheckNowDeps, type CheckNowStep } from '../check-now';

function run(overrides: Partial<CheckNowDeps>) {
  const steps: CheckNowStep[] = [];
  let reloads = 0;
  const outcome = checkForUpdateNow(
    {
      check: () => Promise.resolve({ isAvailable: true }),
      fetch: () => Promise.resolve({ isNew: true }),
      reload: () => {
        reloads += 1;
        return Promise.resolve();
      },
      ...overrides,
    },
    (step) => steps.push(step),
  );
  return { outcome, steps, reloads: () => reloads };
}

describe('checkForUpdateNow', () => {
  it('checks, downloads and restarts into a published update', async () => {
    const { outcome, steps, reloads } = run({});
    expect(await outcome).toEqual({ kind: 'restarting' });
    expect(steps).toEqual(['checking', 'downloading', 'restarting']);
    expect(reloads()).toBe(1);
  });

  it('says so and does not restart when there is nothing newer', async () => {
    const { outcome, steps, reloads } = run({
      check: () => Promise.resolve({ isAvailable: false }),
    });
    expect(await outcome).toEqual({ kind: 'up_to_date' });
    expect(steps).toEqual(['checking']);
    expect(reloads()).toBe(0);
  });

  it('does not restart when the download brought nothing new', async () => {
    const { outcome, reloads } = run({ fetch: () => Promise.resolve({ isNew: false }) });
    expect(await outcome).toEqual({ kind: 'up_to_date' });
    expect(reloads()).toBe(0);
  });

  it('reports why when the check cannot run', async () => {
    const { outcome, reloads } = run({
      check: () => Promise.reject(new Error('updates are not enabled in this build')),
    });
    expect(await outcome).toEqual({
      kind: 'failed',
      message: 'updates are not enabled in this build',
    });
    expect(reloads()).toBe(0);
  });
});
