/**
 * My own plan over the Bali week: a swapped item is mine only under its new name, a skipped one
 * leaves my plan, a change the crew's plan moved under clashes, and a dropped row changes nothing.
 */
import { describe, expect, it } from '@jest/globals';

import { BALI_DAYS, BALI_ITEMS, WINSTON } from '../../overview/dev/bali-plan';
import { buildDayCards } from '../../overview/model/plan-model';
import { PERSONAL_OPS_ID, PERSONAL_POI_NAMES, PERSONAL_ROWS } from '../dev/personal-ops';
import { personalPlan } from '../model/personal-plan';

const plan = personalPlan({
  days: BALI_DAYS,
  items: BALI_ITEMS,
  rows: PERSONAL_ROWS,
  uid: WINSTON,
  poiNames: PERSONAL_POI_NAMES,
});
const find = (label: string) => plan.items.find((item) => item.label === label);

describe('personal plan', () => {
  it('shows my swap as mine only and leaves out what I skip', () => {
    expect(find('Surf lesson')?.justYou).toBe(true);
    expect(find('Surf lesson')?.attendeeIds).toEqual([WINSTON]);
    expect(find('Spa')).toBeUndefined();
    expect(find('Kecak at sunset')).toBeUndefined();
    expect(plan.skipped).toEqual([BALI_ITEMS.find((i) => i.label === 'Kecak at sunset')?.stableId]);
    expect(find('Monkey Forest')?.justYou).toBe(false);
  });

  it('flags the walk the crew moved under my change, with my version kept meanwhile', () => {
    const walk = BALI_ITEMS.find((i) => i.label === 'Ridge walk');
    expect(plan.clashes).toEqual([
      {
        personalOpsId: PERSONAL_OPS_ID,
        stableId: walk?.stableId,
        kind: 'changed_by_crew',
        label: 'Ridge walk',
      },
    ]);
    expect(find('Ridge walk')?.startsAt).toBe('2026-11-04T08:00:00.000Z');
  });

  it('tags the days that hold something just for me', () => {
    const cards = buildDayCards({
      days: BALI_DAYS,
      items: plan.items,
      polls: [],
      weather: [],
      today: null,
    });
    expect(cards.map((card) => card.personal)).toEqual([0, 0, 2, 0, 0, 0, 0]);
  });

  it('is the crew plan when my rows are dropped', () => {
    const dropped = personalPlan({
      days: BALI_DAYS,
      items: BALI_ITEMS,
      rows: PERSONAL_ROWS.map((row) => ({ ...row, status: 'dropped' })),
      uid: WINSTON,
      poiNames: PERSONAL_POI_NAMES,
    });
    expect(dropped.active).toBe(false);
    expect(dropped.items).toBe(BALI_ITEMS);
  });
});
