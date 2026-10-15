import type { DraftPoi } from '@cp/planner';
import { describe, expect, it } from 'vitest';

import { CREWS, planInput } from '../evals/draft/cases';
import { isOutdoors } from '../src/prompts/draft/redraft-rain';

const input = planInput(CREWS[0] as (typeof CREWS)[number]);
const pois = [...input.pois.values()];
const park = pois.find((p) => p.category === 'nature') as DraftPoi;
const museum = pois.find((p) => p.category === 'museum') as DraftPoi;

describe('a place in the open air on a rain day', () => {
  it('follows the researchers’ rain fit when a curated line gives one', () => {
    expect(isOutdoors({ ...park, indoor: true })).toBe(false);
    expect(isOutdoors({ ...museum, indoor: false })).toBe(true);
  });

  it('falls back to the kind of place without one', () => {
    expect(isOutdoors({ ...park, indoor: null })).toBe(true);
    expect(isOutdoors(museum)).toBe(false);
  });
});
