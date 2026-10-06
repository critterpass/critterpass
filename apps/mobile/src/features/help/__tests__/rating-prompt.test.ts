import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import {
  arbitrateRecapEnd,
  ratingSession,
  type RatingRows,
  type RecapEndPorts,
} from '../rating/rating-prompt';

const NOW = new Date('2026-10-07T10:00:00Z');
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString();
const QUIET: RatingRows = {
  openDisruption: false,
  tripActive: false,
  moods: [],
  lastPromptAt: null,
};
const NONE = { ftfEnding: false, rateTripDue: false };

function setup(rows: Partial<RatingRows> = {}, canAsk = true) {
  const ports = {
    rows: jest.fn(() => Promise.resolve({ ...QUIET, ...rows })),
    ask: jest.fn(() => Promise.resolve(canAsk)),
    record: jest.fn((_asked: boolean) => Promise.resolve()),
    now: () => NOW,
  } satisfies RecapEndPorts;
  return ports;
}

describe('rating prompt at the end of a recap', () => {
  beforeEach(() => ratingSession.reset());

  it('asks the store after a trip that ended well, and records that it asked', async () => {
    const ports = setup();
    expect(await arbitrateRecapEnd('r1', NONE, ports)).toBe('store_review');
    expect(ports.ask).toHaveBeenCalledTimes(1);
    expect(ports.record).toHaveBeenCalledWith(true);
  });

  it('gives one recap end one moment per session', async () => {
    const ports = setup();
    await arbitrateRecapEnd('r1', NONE, ports);
    expect(await arbitrateRecapEnd('r1', NONE, ports)).toBeNull();
    expect(ports.ask).toHaveBeenCalledTimes(1);
    expect(ports.record).toHaveBeenCalledTimes(1);
  });

  it.each<[string, Partial<RatingRows>]>([
    ['asked 119 days ago', { lastPromptAt: daysAgo(119) }],
    ['an open disruption on the trip', { openDisruption: true }],
    ['a trip under way', { tripActive: true }],
    ['unhappy feedback this month', { moods: [{ mood: 'grr', sent_at: daysAgo(3) }] }],
  ])('holds back with %s, and records that it held back', async (_name, rows) => {
    const ports = setup(rows);
    expect(await arbitrateRecapEnd('r1', NONE, ports)).toBeNull();
    expect(ports.ask).not.toHaveBeenCalled();
    expect(ports.record).toHaveBeenCalledWith(false);
  });

  it('asks again once 120 days have passed and old unhappy feedback has aged out', async () => {
    const ports = setup({
      lastPromptAt: daysAgo(121),
      moods: [
        { mood: 'meh', sent_at: daysAgo(31) },
        { mood: 'love', sent_at: daysAgo(1) },
      ],
    });
    expect(await arbitrateRecapEnd('r1', NONE, ports)).toBe('store_review');
  });

  it('never asks in a session that showed a paywall, or within ten minutes of an error', async () => {
    ratingSession.notePaywall();
    const afterPaywall = setup();
    expect(await arbitrateRecapEnd('r1', NONE, afterPaywall)).toBeNull();
    expect(afterPaywall.ask).not.toHaveBeenCalled();

    ratingSession.reset();
    ratingSession.noteError(new Date(NOW.getTime() - 9 * 60_000));
    const afterError = setup();
    expect(await arbitrateRecapEnd('r2', NONE, afterError)).toBeNull();
    expect(afterError.ask).not.toHaveBeenCalled();

    ratingSession.reset();
    ratingSession.noteError(new Date(NOW.getTime() - 11 * 60_000));
    expect(await arbitrateRecapEnd('r3', NONE, setup())).toBe('store_review');
  });

  it('lets the free-trip ending card or the rate-the-trip toast take the moment instead', async () => {
    const ending = setup();
    expect(await arbitrateRecapEnd('r1', { ftfEnding: true, rateTripDue: true }, ending)).toBe(
      'ftf_ending',
    );
    const toast = setup();
    expect(await arbitrateRecapEnd('r2', { ftfEnding: false, rateTripDue: true }, toast)).toBe(
      'rate_trip',
    );
    expect(ending.ask).not.toHaveBeenCalled();
    expect(toast.ask).not.toHaveBeenCalled();
    expect(toast.record).toHaveBeenCalledWith(false);
  });

  it('records a held-back request when the store cannot be asked here', async () => {
    const ports = setup({}, false);
    expect(await arbitrateRecapEnd('r1', NONE, ports)).toBeNull();
    expect(ports.record).toHaveBeenCalledWith(false);
  });
});
