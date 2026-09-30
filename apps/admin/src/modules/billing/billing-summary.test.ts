import { describe, expect, it } from 'vitest';

import { extensionQuota, healthTiles } from './billing-summary';

const health = {
  webhook_lag_p95_ms: 1500,
  failed_24h: 0,
  unprocessed: 0,
  reconcile: { run_date: '2026-10-01', checked: 120, drifted: 0, failed: 0, finished_at: 'x' },
  ftf_to_review: 0,
};

describe('billing console summary', () => {
  it('flags failed webhooks, drift and reviews, and reads lag in seconds', () => {
    expect(healthTiles(health).map((tile) => [tile.value, tile.tone])).toEqual([
      ['1.5 s', undefined],
      ['0', 'success'],
      ['0 of 120', 'success'],
      ['0', undefined],
    ]);
    const bad = healthTiles({ ...health, failed_24h: 3, ftf_to_review: 2, reconcile: null });
    expect(bad.map((tile) => tile.tone)).toEqual([undefined, 'danger', 'warn', 'warn']);
  });

  it('counts App Store extensions against two a year', () => {
    expect(extensionQuota(0)).toEqual({ label: '0 of 2 used', left: 2 });
    expect(extensionQuota(3)).toEqual({ label: '2 of 2 used', left: 0 });
  });
});
