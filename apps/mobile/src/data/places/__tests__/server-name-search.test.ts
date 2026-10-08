/**
 * What a search says when the server's part goes wrong: a failed server search is never "no place
 * by that name" (the phone holds only a few places), rows from the phone alone are marked
 * incomplete, and a request that stalls ends as a failure instead of waiting for ever.
 */
import { afterEach, describe, expect, it, jest } from '@jest/globals';

import { searchState, withSearchTimeout } from '../server-name-search';

const phone = { loaded: true, failed: false, arriving: false };

describe('the state under a place search', () => {
  it('is a failure, not "not found", when the server failed and the phone has no match', () => {
    expect(searchState({ rows: 0, local: phone, server: 'failed' })).toEqual({
      state: 'failed',
      more: false,
      incomplete: false,
    });
  });

  it('marks the phone’s own rows incomplete when the server failed', () => {
    expect(searchState({ rows: 2, local: phone, server: 'failed' })).toEqual({
      state: 'results',
      more: false,
      incomplete: true,
    });
    expect(searchState({ rows: 2, local: phone, server: 'ready' }).incomplete).toBe(false);
    expect(searchState({ rows: 2, local: phone, server: 'loading' })).toMatchObject({
      more: true,
      incomplete: false,
    });
  });

  it('says not found only once the server answered with nothing, or offline from the phone', () => {
    expect(searchState({ rows: 0, local: phone, server: 'ready' }).state).toBe('none');
    expect(searchState({ rows: 0, local: phone, server: 'offline' }).state).toBe('none');
    expect(
      searchState({ rows: 0, local: { ...phone, arriving: true }, server: 'offline' }).state,
    ).toBe('arriving');
    expect(searchState({ rows: 0, local: phone, server: 'loading' }).state).toBe('searching');
  });
});

describe('a place search request', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  const stalled = (signal: AbortSignal) =>
    new Promise<never>((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new Error('aborted')));
    });

  it('fails after the timeout when nothing answers', async () => {
    jest.useFakeTimers();
    const outer = new AbortController();
    const run = withSearchTimeout(outer.signal, stalled, 1_000);
    const outcome = run.then(
      () => 'answered',
      () => 'failed',
    );
    jest.advanceTimersByTime(1_000);
    await expect(outcome).resolves.toBe('failed');
    expect(outer.signal.aborted).toBe(false);
  });

  it('stops with the caller’s signal and answers when the request does', async () => {
    const outer = new AbortController();
    const run = withSearchTimeout(outer.signal, stalled, 60_000).catch(() => 'failed');
    outer.abort();
    await expect(run).resolves.toBe('failed');
    await expect(
      withSearchTimeout(new AbortController().signal, () => Promise.resolve('rows')),
    ).resolves.toBe('rows');
  });
});
