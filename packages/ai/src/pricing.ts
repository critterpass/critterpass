/**
 * Claude list prices → `cost_micros` (1 micro = 1e-6 USD) for `ai_usage`.
 *
 * Source: https://platform.claude.com/docs/en/about-claude/pricing (read 2026-09-27): per-MTok
 * base input, 5-minute and 1-hour cache writes, cache hits and output for Haiku 4.5, Sonnet 5 and
 * Opus 5.5; Batch API −50% on input and output, stacking with the cache multipliers; web search
 * $10 per 1,000 searches. A rate of N USD/MTok is N micros per token, so rates are stored as
 * micros per million tokens and divided once at the end to keep the arithmetic integral.
 *
 * Jev (https://docs.typesafe.ai/models, read 2026-09-27): $0.042 per MTok input, output free, no
 * cache or batch pricing, so a decision call costs its input tokens only.
 */
import type { AiTier } from '@cp/domain';

export interface ModelPrice {
  readonly input: number;
  readonly cacheWrite5m: number;
  readonly cacheWrite1h: number;
  readonly cacheRead: number;
  readonly output: number;
}

const USD = 1_000_000;

/** Micros per million tokens. */
export const PRICES: Readonly<Record<AiTier, ModelPrice>> = {
  haiku: {
    input: 1 * USD,
    cacheWrite5m: 1.25 * USD,
    cacheWrite1h: 2 * USD,
    cacheRead: 0.1 * USD,
    output: 5 * USD,
  },
  sonnet: {
    input: 2 * USD,
    cacheWrite5m: 2.5 * USD,
    cacheWrite1h: 4 * USD,
    cacheRead: 0.2 * USD,
    output: 10 * USD,
  },
  opus: {
    input: 4 * USD,
    cacheWrite5m: 5 * USD,
    cacheWrite1h: 8 * USD,
    cacheRead: 0.2 * USD,
    output: 20 * USD,
  },
  jev: {
    input: 42_000,
    cacheWrite5m: 0,
    cacheWrite1h: 0,
    cacheRead: 0,
    output: 0,
  },
};

/** Micros per web search request. */
export const WEB_SEARCH_MICROS = 10_000;

/** Token counts of one call, split by how each token is billed. */
export interface TokenUsage {
  /** Uncached input tokens (the API's `input_tokens`). */
  readonly inputTokens: number;
  readonly cacheWrite5mTokens: number;
  readonly cacheWrite1hTokens: number;
  readonly cacheReadTokens: number;
  readonly outputTokens: number;
  readonly webSearchRequests: number;
}

export interface CostOptions {
  /** Message Batches API call: every token rate is halved (Claude tiers only). */
  readonly batch?: boolean;
}

export function computeCostMicros(
  tier: AiTier,
  usage: TokenUsage,
  options: CostOptions = {},
): number {
  const price = PRICES[tier];
  const weighted =
    usage.inputTokens * price.input +
    usage.cacheWrite5mTokens * price.cacheWrite5m +
    usage.cacheWrite1hTokens * price.cacheWrite1h +
    usage.cacheReadTokens * price.cacheRead +
    usage.outputTokens * price.output;
  const divisor = options.batch === true && tier !== 'jev' ? 2 * USD : USD;
  return Math.round(weighted / divisor) + usage.webSearchRequests * WEB_SEARCH_MICROS;
}
