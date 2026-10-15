/**
 * What researchers found about a destination shapes the outline: places in one of its named
 * areas share an area, its essentials lead the must-sees in their ranked order, and how
 * itinerary pages lay out a first visit is shown with ids only for the places the outline may pick.
 */
import type { DraftPoi } from '@cp/planner';
import { describe, expect, it } from 'vitest';

import { CREWS, planInput } from '../evals/draft/cases';
import { areasOf } from '../src/prompts/draft/areas';
import { aliases, type DraftPlanInput } from '../src/prompts/draft/context';
import { firstVisitLines } from '../src/prompts/draft/first-visit';
import { coreMustSees } from '../src/prompts/draft/must-sees';

const crew = CREWS.find((c) => c.id === 'dalat-curated-1');
if (crew === undefined) throw new Error('no dalat-curated-1 crew');
const { locale: _locale, ...base } = planInput(crew);

/** The input with some activities changed (new pools, so nothing cached is reused). */
function withActivities(change: (poi: DraftPoi, index: number) => DraftPoi): DraftPlanInput {
  const activities = base.pools.activities.map(change);
  const pois = new Map(base.pois);
  for (const poi of activities) pois.set(poi.id, poi);
  return { ...base, pois, pools: { ...base.pools, activities } };
}

describe('a destination’s researched areas', () => {
  it('put places of one named area together, however far the first sits from the others', () => {
    const named = new Set([0, 5, 9]);
    const input = withActivities((poi, i) => (named.has(i) ? { ...poi, area: 'Old Town' } : poi));
    const areas = areasOf(input);
    const labels = [...named].map((i) => areas.of(base.pools.activities[i]?.id ?? ''));
    expect(new Set(labels).size).toBe(1);
    expect(areas.lines.filter((line) => line.includes('(Old Town)'))).toHaveLength(1);
  });
});

describe('the essentials of a first visit', () => {
  it('lead the must-sees in the order the researchers ranked them', () => {
    const ranked = [7, 3, 11];
    const input = withActivities((poi, i) => {
      const rank = ranked.indexOf(i);
      return rank === -1
        ? { ...poi, essential: false }
        : { ...poi, essential: true, mustSee: true, essentialRank: rank + 1 };
    });
    const ids = ranked.map((i) => base.pools.activities[i]?.id);
    expect(coreMustSees(input).slice(0, 3)).toEqual(ids);
  });
});

describe('how itinerary pages lay out a first visit', () => {
  it('names every stop and gives an id only to places the outline may pick', () => {
    const offered = base.pools.activities[0];
    if (offered === undefined) throw new Error('no activities');
    const input: DraftPlanInput = {
      ...base,
      firstVisit: {
        days: [
          {
            theme: 'Lake and market',
            areas: ['Centre'],
            stops: [
              { name: offered.name, poiId: offered.id },
              { name: 'A place held elsewhere', poiId: '0199b000-0000-7000-8000-000000000999' },
              { name: 'Unmatched cafe', poiId: null },
            ],
            pages: 4,
          },
        ],
      },
    };
    const [, day] = firstVisitLines(input, new Set([offered.id]));
    expect(day).toContain(`${offered.name} (${aliases(input).place(offered.id)})`);
    expect(day).toContain('A place held elsewhere →');
    expect(day).not.toContain('000000000999');
    expect(firstVisitLines(base, new Set())).toEqual([]);
  });
});
