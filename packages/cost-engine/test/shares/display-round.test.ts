import { describe, expect, it } from 'vitest';

import { displayDelta, roundEach, roundedMean } from '../../src/display/round';
import { money } from '../../src/money/money';

describe('display rounding', () => {
  it('rounds "each" figures to whole major units, half up', () => {
    expect(roundEach(money(130_950n, 'USD'))).toEqual(money(131_000n, 'USD'));
    expect(roundEach(money(130_949n, 'USD'))).toEqual(money(130_900n, 'USD'));
    expect(roundEach(money(-150n, 'USD'))).toEqual(money(-200n, 'USD'));
    expect(roundEach(money(1_234n, 'JPY'))).toEqual(money(1_234n, 'JPY'));
  });

  it('takes a delta between rounded labels so the label matches the odometer', () => {
    expect(displayDelta(money(130_949n, 'USD'), money(133_350n, 'USD'))).toEqual(
      money(2_500n, 'USD'),
    );
  });

  it('rounds a crew mean', () => {
    expect(roundedMean([100n, 250n], 'USD')).toEqual(money(200n, 'USD'));
    expect(roundedMean([], 'USD')).toEqual(money(0n, 'USD'));
  });
});
