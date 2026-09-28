import { describe, expect, it } from 'vitest';

import { isEstimatedCostIndex, reviewCostIndexInputSchema } from './cost-review';
import { canRunAdminCommand } from './policy';

const INDEX_ID = '019a0000-0000-7000-8000-000000000001';

describe('cost index review', () => {
  it('marks an index without a cited source page as an estimate', () => {
    expect(isEstimatedCostIndex({ source_url: null })).toBe(true);
    expect(isEstimatedCostIndex({ source_url: 'https://www.numbeo.com/' })).toBe(false);
  });

  it('refuses edited amounts with the nightly range inverted', () => {
    const amounts = {
      nightly_minor_low: 9000,
      nightly_minor_high: 6000,
      food_pp_day_minor: 4000,
      fun_pp_day_minor: 3000,
    };
    expect(reviewCostIndexInputSchema.safeParse({ index_id: INDEX_ID, amounts }).success).toBe(
      false,
    );
    expect(
      reviewCostIndexInputSchema.safeParse({
        index_id: INDEX_ID,
        amounts: { ...amounts, nightly_minor_high: 9000 },
      }).success,
    ).toBe(true);
    expect(reviewCostIndexInputSchema.safeParse({ index_id: INDEX_ID }).success).toBe(true);
  });

  it('lets only the content role review cost indices', () => {
    expect(canRunAdminCommand(['content'], 'review_cost_index').ok).toBe(true);
    expect(canRunAdminCommand(['support'], 'review_cost_index').ok).toBe(false);
    expect(canRunAdminCommand(['ops'], 'review_cost_index').ok).toBe(false);
  });
});
