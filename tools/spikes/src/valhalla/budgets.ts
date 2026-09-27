/** Routing latency budgets: point-to-point routes and a 16x16 time-distance matrix. */
export const ROUTE_P95_BUDGET_MS = 300;
export const MATRIX_16X16_P95_BUDGET_MS = 1_000;

export interface BudgetVerdict {
  readonly label: string;
  readonly p95Ms: number;
  readonly budgetMs: number;
  readonly pass: boolean;
}

/** Strictly-under-budget PASS, matching the phase file's "<" wording (not "<="). */
export function evaluateBudget(label: string, p95Ms: number, budgetMs: number): BudgetVerdict {
  return { label, p95Ms, budgetMs, pass: p95Ms < budgetMs };
}

export function evaluateRouteBudget(label: string, p95Ms: number): BudgetVerdict {
  return evaluateBudget(label, p95Ms, ROUTE_P95_BUDGET_MS);
}

export function evaluateMatrixBudget(label: string, p95Ms: number): BudgetVerdict {
  return evaluateBudget(label, p95Ms, MATRIX_16X16_P95_BUDGET_MS);
}
