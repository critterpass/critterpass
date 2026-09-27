import { describe, expect, it } from 'vitest';

import { isStaleSnapshot, type FxSnapshot } from '../../src/fx/snapshot';

function snapshotAsOf(asOf: string): FxSnapshot {
  return { base: 'EUR', quote: 'SGD', rate: '1.4571', asOf, source: 'frankfurter' };
}

describe('isStaleSnapshot', () => {
  it('is not stale exactly at the default 48h threshold', () => {
    const now = new Date('2026-09-27T00:00:00Z');
    expect(isStaleSnapshot(snapshotAsOf('2026-09-25'), now)).toBe(false);
  });

  it('is stale just past the default 48h threshold', () => {
    const now = new Date('2026-09-27T00:00:01Z');
    expect(isStaleSnapshot(snapshotAsOf('2026-09-25'), now)).toBe(true);
  });

  it('is never stale for a same-day snapshot', () => {
    const now = new Date('2026-09-27T23:00:00Z');
    expect(isStaleSnapshot(snapshotAsOf('2026-09-27'), now)).toBe(false);
  });

  it('respects a custom threshold', () => {
    const now = new Date('2026-09-27T00:00:00Z');
    expect(isStaleSnapshot(snapshotAsOf('2026-09-26'), now, 12)).toBe(true);
    expect(isStaleSnapshot(snapshotAsOf('2026-09-26'), now, 36)).toBe(false);
  });
});
