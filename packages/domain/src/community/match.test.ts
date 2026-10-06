import { describe, expect, it } from 'vitest';

import { budgetFit, crewTasteTags, matchScore, monthProximity, type CrewTaste } from './match';

const crew: CrewTaste = {
  tags: crewTasteTags([['temples', 'markets'], ['temples'], ['street_food']]),
  crew_size: 3,
  month: 4,
  budget_pp_minor: 150_000,
};

describe('matchScore', () => {
  it('ranks the plan closest to the crew taste first, whatever its popularity', () => {
    const temples = {
      taste: { temples: 0.6, markets: 0.2 },
      crew_size: 3,
      travel_month: 4,
      cost_pp_minor: 120_000,
    };
    const nightlife = {
      taste: { nightlife: 0.8 },
      crew_size: 3,
      travel_month: 4,
      cost_pp_minor: 120_000,
    };
    expect(matchScore(crew, temples)).toBeGreaterThan(matchScore(crew, nightlife));
  });

  it('prefers the nearer month and crew size when tastes tie', () => {
    const base = { taste: { temples: 1 }, cost_pp_minor: null };
    const near = matchScore(crew, { ...base, crew_size: 3, travel_month: 5 });
    const far = matchScore(crew, { ...base, crew_size: 8, travel_month: 10 });
    expect(near).toBeGreaterThan(far);
  });

  it('stays within 0–100', () => {
    const perfect = matchScore(
      { tags: { temples: 1 }, crew_size: 2, month: 1, budget_pp_minor: 100 },
      { taste: { temples: 1 }, crew_size: 2, travel_month: 1, cost_pp_minor: 50 },
    );
    expect(perfect).toBe(100);
    const none = matchScore(
      { tags: {}, crew_size: 1, month: 1, budget_pp_minor: 100 },
      { taste: { temples: 1 }, crew_size: 9, travel_month: 7, cost_pp_minor: 500 },
    );
    expect(none).toBe(0);
  });
});

describe('fit parts', () => {
  it('treats December and January as neighbours', () => {
    expect(monthProximity(12, 1)).toBeCloseTo(1 - 1 / 6);
  });

  it('scores a plan over budget down to zero at double', () => {
    expect(budgetFit(100, 100)).toBe(1);
    expect(budgetFit(100, 150)).toBe(0.5);
    expect(budgetFit(100, 250)).toBe(0);
  });
});
