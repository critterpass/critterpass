/**
 * Per-batch cost log and cap. Every model call adds its tokens and cost; the generate stage stops
 * starting new calls once the batch would pass its cap (`--max-usd`, default $5).
 */
export interface CostTotals {
  calls: number;
  cachedUnits: number;
  tokensIn: number;
  tokensOut: number;
  costMicros: number;
}

export const DEFAULT_MAX_COST_MICROS = 5_000_000;

export function emptyCost(): CostTotals {
  return { calls: 0, cachedUnits: 0, tokensIn: 0, tokensOut: 0, costMicros: 0 };
}

export function addCall(
  totals: CostTotals,
  call: { tokensIn: number; tokensOut: number; costMicros: number },
): CostTotals {
  return {
    ...totals,
    calls: totals.calls + 1,
    tokensIn: totals.tokensIn + call.tokensIn,
    tokensOut: totals.tokensOut + call.tokensOut,
    costMicros: totals.costMicros + call.costMicros,
  };
}

export function formatCost(totals: CostTotals): string {
  const usd = (totals.costMicros / 1_000_000).toFixed(4);
  return `${totals.calls} calls (${totals.cachedUnits} cached) · ${totals.tokensIn} in / ${totals.tokensOut} out · $${usd}`;
}
