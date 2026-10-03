/**
 * Which crowd curve a place shows for a weekday when several sources have one (`crowd_forecasts`
 * is keyed by place, source and weekday): what crews saw there (`visits`, five crews or more)
 * first, then an editorial typical week the founder approved, then a bought forecast. An editorial
 * curve nobody approved is never shown. Every reader, on the server and on the phone, picks
 * through this one rule, so a place never says two different things.
 */
export interface CrowdCurveRow {
  readonly source: string;
  /** Set when ops approved an editorial curve; absent or null otherwise. */
  readonly approved_at?: Date | string | null;
}

const RANK: Readonly<Record<string, number>> = { visits: 0, editorial: 1, besttime: 2 };

/** The curve's place in the precedence, or null when it may not be shown at all. */
export function crowdCurveRank(row: CrowdCurveRow): number | null {
  if (row.source === 'editorial' && (row.approved_at === null || row.approved_at === undefined)) {
    return null;
  }
  return RANK[row.source] ?? null;
}

/** The one curve to show among a place's rows for one weekday; null when none may be shown. */
export function pickCrowdCurve<T extends CrowdCurveRow>(rows: readonly T[]): T | null {
  let best: T | null = null;
  let bestRank = Number.POSITIVE_INFINITY;
  for (const row of rows) {
    const rank = crowdCurveRank(row);
    if (rank !== null && rank < bestRank) {
      best = row;
      bestRank = rank;
    }
  }
  return best;
}
