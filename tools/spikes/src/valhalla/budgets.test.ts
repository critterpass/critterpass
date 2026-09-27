import { describe, expect, it } from 'vitest';

import {
  evaluateBudget,
  evaluateMatrixBudget,
  evaluateRouteBudget,
  MATRIX_16X16_P95_BUDGET_MS,
  ROUTE_P95_BUDGET_MS,
} from './budgets';

describe('evaluateBudget', () => {
  it('passes when strictly under budget', () => {
    expect(evaluateBudget('walk p95', 299.9, 300).pass).toBe(true);
  });

  it('fails exactly at budget (strict less-than, not less-or-equal)', () => {
    expect(evaluateBudget('walk p95', 300, 300).pass).toBe(false);
  });

  it('fails above budget', () => {
    expect(evaluateBudget('walk p95', 300.1, 300).pass).toBe(false);
  });

  it('carries the label and numbers through unchanged', () => {
    const verdict = evaluateBudget('drive p95 (bangkok)', 150, 300);
    expect(verdict).toEqual({
      label: 'drive p95 (bangkok)',
      p95Ms: 150,
      budgetMs: 300,
      pass: true,
    });
  });
});

describe('evaluateRouteBudget', () => {
  it('uses the 300 ms route budget', () => {
    expect(evaluateRouteBudget('walk', ROUTE_P95_BUDGET_MS - 1).pass).toBe(true);
    expect(evaluateRouteBudget('walk', ROUTE_P95_BUDGET_MS).pass).toBe(false);
  });
});

describe('evaluateMatrixBudget', () => {
  it('uses the 1000 ms matrix budget', () => {
    expect(evaluateMatrixBudget('16x16', MATRIX_16X16_P95_BUDGET_MS - 1).pass).toBe(true);
    expect(evaluateMatrixBudget('16x16', MATRIX_16X16_P95_BUDGET_MS).pass).toBe(false);
  });
});
