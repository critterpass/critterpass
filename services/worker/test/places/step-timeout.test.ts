/**
 * Step time limits for the place ingest: a hung step rejects at its limit and is asked to stop, a
 * step that finishes in time is untouched.
 */
import { describe, expect, it, vi } from 'vitest';

import { StepTimeoutError, withStepTimeout } from '../../src/places/step-timeout';

describe('withStepTimeout', () => {
  it('rejects a step that outlives its limit and asks it to stop', async () => {
    const stop = vi.fn();
    const hung = withStepTimeout('osm download', 20, () => new Promise<never>(() => {}), stop);
    await expect(hung).rejects.toBeInstanceOf(StepTimeoutError);
    await expect(hung).rejects.toThrow('osm download took longer than');
    expect(stop).toHaveBeenCalledOnce();
  });

  it('passes through a step that finishes in time, result or error', async () => {
    const stop = vi.fn();
    await expect(withStepTimeout('read', 1_000, () => Promise.resolve(3), stop)).resolves.toBe(3);
    await expect(
      withStepTimeout('read', 1_000, () => Promise.reject(new Error('s3 403')), stop),
    ).rejects.toThrow('s3 403');
    expect(stop).not.toHaveBeenCalled();
  });
});
