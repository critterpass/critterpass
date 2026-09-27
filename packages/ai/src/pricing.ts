/**
 * Model prices → `cost_micros` (1 micro = 1e-6 USD) for `ai_usage`.
 *
 * DeepSeek (https://api-docs.deepseek.com/quick_start/pricing, read 2026-09-28), per million tokens:
 *
 * | Tier | Model | Cache-hit input | Cache-miss input | Output |
 * |---|---|---|---|---|
 * | fast | `deepseek-flash` | $0.003 off-peak / $0.006 peak | $0.15 / $0.30 | $0.60 / $1.20 |
 * | pro | `deepseek-v4-pro` | $0.022 / $0.044 | $0.66 / $1.32 | $1.98 / $3.96 |
 *
 * Peak hours are 01:00–04:00 and 06:00–10:00 UTC, Monday to Friday; every other hour is off-peak
 * at half the peak rate. DeepSeek also bills Chinese public holidays off-peak in full; the holiday
 * calendar is not encoded here, so a weekday-holiday call inside a peak window is recorded at the
 * peak rate (an over-count, never an under-count). Context caching is automatic and cache writes
 * cost the plain input rate. There is no batch discount (DeepSeek has no batch API).
 *
 * Jev (https://docs.typesafe.ai/models, read 2026-09-27): $0.042 per MTok input, output free, no
 * cache pricing or peak hours, so a decision call costs its input tokens only.
 *
 * A rate of N USD/MTok is N micros per token, so rates are stored as micros per million tokens and
 * divided once at the end to keep the arithmetic integral.
 */
import type { AiTier } from '@cp/domain';

export interface ModelPrice {
  /** Cache-miss input (and cache writes). */
  readonly input: number;
  /** Cache-hit input. */
  readonly cacheRead: number;
  readonly output: number;
}

export interface TierPrice {
  readonly offPeak: ModelPrice;
  readonly peak: ModelPrice;
}

const PER_MTOK = 1_000_000;

const flat = (price: ModelPrice): TierPrice => ({ offPeak: price, peak: price });

/** Micros per million tokens. */
export const PRICES: Readonly<Record<AiTier, TierPrice>> = {
  fast: {
    offPeak: { input: 150_000, cacheRead: 3_000, output: 600_000 },
    peak: { input: 300_000, cacheRead: 6_000, output: 1_200_000 },
  },
  pro: {
    offPeak: { input: 660_000, cacheRead: 22_000, output: 1_980_000 },
    peak: { input: 1_320_000, cacheRead: 44_000, output: 3_960_000 },
  },
  jev: flat({ input: 42_000, cacheRead: 0, output: 0 }),
};

/** UTC hour ranges `[from, to)` billed at the peak rate, Monday to Friday. */
export const PEAK_WINDOWS_UTC: readonly (readonly [number, number])[] = [
  [1, 4],
  [6, 10],
];

/** True when a call finishing at `at` is billed at DeepSeek's peak rate. */
export function isPeakTime(at: Date): boolean {
  const day = at.getUTCDay();
  if (day === 0 || day === 6) return false;
  const hour = at.getUTCHours();
  return PEAK_WINDOWS_UTC.some(([from, to]) => hour >= from && hour < to);
}

/** Token counts of one call, split by how each token is billed. */
export interface TokenUsage {
  /** Uncached input tokens (the API's `input_tokens`). */
  readonly inputTokens: number;
  /** Input tokens reported as cache writes; billed as uncached input. */
  readonly cacheWriteTokens: number;
  readonly cacheReadTokens: number;
  readonly outputTokens: number;
}

export function computeCostMicros(tier: AiTier, usage: TokenUsage, at: Date): number {
  const price = isPeakTime(at) ? PRICES[tier].peak : PRICES[tier].offPeak;
  const weighted =
    (usage.inputTokens + usage.cacheWriteTokens) * price.input +
    usage.cacheReadTokens * price.cacheRead +
    usage.outputTokens * price.output;
  return Math.round(weighted / PER_MTOK);
}
