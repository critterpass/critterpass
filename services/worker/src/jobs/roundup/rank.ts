/**
 * Which rolled-up items make the evening roundup (docs/api-contracts-async.md §2.3): anything
 * that needs the recipient first, then the most recent; at most five lines. The rest stay in the
 * inbox.
 */
export const ROUNDUP_MAX_LINES = 5;

export interface RoundupCandidate {
  readonly id: string;
  readonly text: string;
  readonly needsYou: boolean;
  readonly createdAt: Date;
}

export function rankRoundupItems(
  items: readonly RoundupCandidate[],
  cap: number = ROUNDUP_MAX_LINES,
): RoundupCandidate[] {
  return [...items]
    .sort(
      (a, b) =>
        Number(b.needsYou) - Number(a.needsYou) || b.createdAt.getTime() - a.createdAt.getTime(),
    )
    .slice(0, cap);
}
