import { describe, expect, it } from 'vitest';

import { chipUnits } from '../../src/travel-data/fx';

describe('the destination FX chip amount', () => {
  it('is the smallest round local amount worth a unit of the reader’s currency', () => {
    // ¥1 ≈ $0.0067: ¥1,000 ≈ $6.70.
    expect(chipUnits(0.0067, 'JPY', 'USD')).toBe(1000);
    // $1 ≈ ₫26,000: one dollar already reads.
    expect(chipUnits(26_000, 'USD', 'VND')).toBe(1);
  });

  it('never converts less than the cash either side quotes', () => {
    // Rp1 ≈ ₫1.6 read "Rp1 ≈ ₫1": a thousand rupiah is the smallest sum anyone hands over.
    expect(chipUnits(1.6, 'IDR', 'VND')).toBe(1000);
    // ₫1 ≈ Rp0.62: ₫1,000 ≈ Rp620 is under the rupiah's cash step, so ₫10,000 ≈ Rp6,200.
    expect(chipUnits(0.62, 'VND', 'IDR')).toBe(10_000);
    // Rp1 ≈ S$0.0000857: Rp100,000 ≈ S$8.57.
    expect(chipUnits(0.0000857, 'IDR', 'SGD')).toBe(100_000);
  });
});
