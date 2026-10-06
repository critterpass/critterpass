import { publicPlanSchema, type PublicPlan } from '@cp/domain';
import type { MessageDescriptor } from '@lingui/core';
import { describe, expect, it } from 'vitest';

import { planAppPath, planDayRows, planWords } from './plan-facts';

// Descriptor ids and their values, so the assertions read what was asked for, not the copy.
const t = (descriptor: MessageDescriptor, values?: Record<string, unknown>): string =>
  `${descriptor.id}${values === undefined ? '' : JSON.stringify(values)}`;

const plan: PublicPlan = publicPlanSchema.parse({
  kind: 'plan',
  shared_plan_id: '0190a6f1-7aaa-7bbb-8ccc-123456789abc',
  title: null,
  destination_name: 'Kyoto',
  days_count: 3,
  travel_month: 4,
  travel_year: 2026,
  crew_size: 3,
  crew_names: ['Maya', 'Arjun', 'Jess'],
  travelled: true,
  tags: [],
  days: [
    {
      day_no: 1,
      theme: 'Temples before the crowds',
      places: [
        { name: 'Fushimi Inari', category: 'temple_shrine' },
        { name: 'Nishiki Market', category: 'market' },
      ],
    },
    {
      day_no: 2,
      theme: null,
      places: [
        { name: 'Arashiyama', category: 'nature' },
        { name: 'Tenryu-ji', category: 'temple_shrine' },
      ],
    },
    { day_no: 3, theme: null, places: [] },
  ],
  rating_avg: 4.5,
  rating_count: 2,
  copies_count: 7,
});

describe('planWords', () => {
  it('names the crew only when the plan carries names', () => {
    expect(planWords(plan, t).byline).toBe('web.plan.plannedBy{"names":"Maya, Arjun, and Jess"}');
    expect(planWords({ ...plan, crew_names: null }, t).byline).toBeNull();
  });

  it('says how long, when, how many and whether the trip happened', () => {
    expect(planWords(plan, t).chips).toEqual([
      'web.plan.days{"days":3}',
      'April 2026',
      'web.plan.crewOf{"size":3}',
      'web.plan.travelled',
    ]);
    const planned = { ...plan, travelled: false, travel_month: null, crew_size: 1 };
    expect(planWords(planned, t).chips).toEqual([
      'web.plan.days{"days":3}',
      'web.plan.solo',
      'web.plan.planned',
    ]);
  });

  it('shows ratings and copies only when there are any', () => {
    expect(planWords(plan, t).proof).toEqual([
      'web.plan.rating{"average":"4.5","count":2}',
      'web.plan.copies{"count":7}',
    ]);
    const fresh = { ...plan, rating_avg: null, rating_count: 0, copies_count: 0 };
    expect(planWords(fresh, t).proof).toEqual([]);
  });

  it("uses the crew's own title when the plan has one", () => {
    expect(planWords({ ...plan, title: 'Kyoto, slowly' }, t).headline).toBe('Kyoto, slowly');
    expect(planWords(plan, t).headline).toBe('web.plan.headline{"days":3,"place":"Kyoto"}');
  });
});

describe('planDayRows', () => {
  it('titles a day by its theme, else its first place, and lists the rest', () => {
    expect(planDayRows(plan)).toEqual([
      {
        dayNo: 1,
        title: 'Temples before the crowds',
        line: 'Fushimi Inari · Nishiki Market',
        tone: 'green',
      },
      { dayNo: 2, title: 'Arashiyama', line: 'Tenryu-ji', tone: 'orange' },
      { dayNo: 3, title: null, line: null, tone: 'blue' },
    ]);
  });
});

describe('planAppPath', () => {
  it('points "Copy into my trip" at the plan\'s screen in the app', () => {
    expect(planAppPath(plan)).toBe('/app/community/plan/0190a6f1-7aaa-7bbb-8ccc-123456789abc');
  });
});
