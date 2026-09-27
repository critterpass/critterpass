import type pg from 'pg';
import { describe, expect, it } from 'vitest';

import { embedPoi, embedPoisForDestination, type EmbeddingVendor } from '../../src/places/embed';

/** Throws if touched at all: proves the disabled/no-vendor path never opens a connection. */
function poisonedPool(): pg.Pool {
  return {
    connect: () => {
      throw new Error('embed.ts must not touch the database when disabled');
    },
  } as unknown as pg.Pool;
}

const fakeVendor: EmbeddingVendor = {
  model: 'fake-model',
  embed: (texts) => Promise.resolve(texts.map(() => [0.1, 0.2, 0.3])),
};

describe('embedPoi', () => {
  it('is a no-op and touches nothing when disabled (no embedding vendor chosen yet)', async () => {
    const result = await embedPoi(poisonedPool(), 'poi-1', { enabled: false });
    expect(result).toEqual({ embedded: 0, skipped: true });
  });

  it('is a no-op when enabled but no vendor is configured', async () => {
    const result = await embedPoi(poisonedPool(), 'poi-1', { enabled: true });
    expect(result).toEqual({ embedded: 0, skipped: true });
  });
});

describe('embedPoisForDestination', () => {
  it('is a no-op and touches nothing when disabled', async () => {
    const result = await embedPoisForDestination(poisonedPool(), 'destination-1', {
      enabled: false,
    });
    expect(result).toEqual({ embedded: 0, skipped: true });
  });

  it('is a no-op when enabled but no vendor is configured, even with a real vendor type available', async () => {
    // Sanity: fakeVendor exists and type-checks against EmbeddingVendor, but is intentionally not passed.
    expect(typeof fakeVendor.embed).toBe('function');
    const result = await embedPoisForDestination(poisonedPool(), 'destination-1', {
      enabled: true,
    });
    expect(result).toEqual({ embedded: 0, skipped: true });
  });
});
