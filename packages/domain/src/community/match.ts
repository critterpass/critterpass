/**
 * How well a published plan fits the viewing crew (Crew plans browse): the cosine of the crew's
 * taste against the plan's, plus how close the travel month is, how near the crew size and
 * whether the cost fits. Pure, so the browse route and its tests rank the same way. Ranking is
 * commission-neutral: copies and saves never enter the score.
 */

export interface ViewerTaste {
  /** Each visible taste tag's share of the crew's members who hold it (0–1). */
  readonly tags: Readonly<Record<string, number>>;
  readonly crew_size: number;
  /** 1–12, the month the crew travels, when known. */
  readonly month: number | null;
  /** The crew's per-person budget ceiling in the plan's currency, when known. */
  readonly budget_pp_minor: number | null;
}

export interface PlanMatchInput {
  readonly taste: Readonly<Record<string, number>>;
  readonly crew_size: number;
  readonly travel_month: number | null;
  readonly cost_pp_minor: number | null;
}

export const MATCH_WEIGHTS = { taste: 0.7, month: 0.1, crew: 0.1, budget: 0.1 } as const;

export function cosine(
  a: Readonly<Record<string, number>>,
  b: Readonly<Record<string, number>>,
): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const [key, value] of Object.entries(a)) {
    na += value * value;
    dot += value * (b[key] ?? 0);
  }
  for (const value of Object.values(b)) nb += value * value;
  if (na === 0 || nb === 0) return 0;
  return dot / Math.sqrt(na * nb);
}

/** 1 in the same month, falling to 0 six months away (December is next to January). */
export function monthProximity(a: number | null, b: number | null): number {
  if (a === null || b === null) return 0.5;
  const gap = Math.abs(a - b);
  return 1 - Math.min(gap, 12 - gap) / 6;
}

/** 1 for the same crew size, losing a quarter per member of difference. */
export function crewFit(a: number, b: number): number {
  return Math.max(0, 1 - Math.abs(a - b) / 4);
}

/** 1 when the plan costs no more than the budget, falling to 0 at twice the budget. */
export function budgetFit(budget: number | null, cost: number | null): number {
  if (budget === null || cost === null || budget <= 0) return 0.5;
  if (cost <= budget) return 1;
  return Math.max(0, 1 - (cost - budget) / budget);
}

/** 0–100, the "{pct}% YOUR TASTE" on a card. */
export function matchScore(crew: ViewerTaste, plan: PlanMatchInput): number {
  const score =
    MATCH_WEIGHTS.taste * cosine(crew.tags, plan.taste) +
    MATCH_WEIGHTS.month * monthProximity(crew.month, plan.travel_month) +
    MATCH_WEIGHTS.crew * crewFit(crew.crew_size, plan.crew_size) +
    MATCH_WEIGHTS.budget * budgetFit(crew.budget_pp_minor, plan.cost_pp_minor);
  return Math.round(score * 100);
}

/** Members' visible tags folded into one crew taste: each tag's share of members holding it. */
export function crewTasteTags(members: readonly (readonly string[])[]): Record<string, number> {
  const counts = new Map<string, number>();
  for (const tags of members) {
    for (const tag of new Set(tags)) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  const size = Math.max(1, members.length);
  return Object.fromEntries([...counts].map(([tag, count]) => [tag, count / size]));
}
