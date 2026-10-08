import { describe, expect, it } from '@jest/globals';

import { contrastRatio, tokens } from '@cp/design-tokens';

import { treatmentFor } from '@/ui/media/duotone';

describe('showdown chips in ink', () => {
  it.each(tokens.guide.order)(
    'read on the %s place colour and on the darkest tone its photo takes',
    (guide) => {
      const ink = tokens.color.ink['850'];
      const colour = tokens.guide[guide];
      expect(contrastRatio(ink, colour)).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(ink, treatmentFor('accent', colour, ink).shadow)).toBeGreaterThanOrEqual(
        4.5,
      );
    },
  );
});
