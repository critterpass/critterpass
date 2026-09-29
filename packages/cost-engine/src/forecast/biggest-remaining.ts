/**
 * The biggest cost still ahead of the crew: the largest remaining plan item or booked cost not yet
 * expensed. Ties go to the earlier day, then the id, so the answer never flickers.
 */
export interface RemainingCost {
  readonly id: string;
  /** Trip day (1-based); 0 when the day is unknown. */
  readonly day: number;
  readonly category: string;
  readonly amountMinor: bigint;
  /** What to call it ("The boat day"); null when nothing names it. */
  readonly label: string | null;
}

export function biggestRemaining(costs: readonly RemainingCost[]): RemainingCost | null {
  let best: RemainingCost | null = null;
  for (const cost of costs) {
    if (cost.amountMinor <= 0n) continue;
    if (
      best === null ||
      cost.amountMinor > best.amountMinor ||
      (cost.amountMinor === best.amountMinor &&
        (cost.day < best.day || (cost.day === best.day && cost.id < best.id)))
    ) {
      best = cost;
    }
  }
  return best;
}
