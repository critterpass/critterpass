/**
 * Trip setup, budget (docs/api-contracts.md §4.5, §5.5): every member's max is write-only C3. The
 * crew sees a band only once at least `BUDGET_K_MIN` maxes are in; below that, the count ("2 of 6
 * set") and each member's own fit against the organiser's target are all that exist. Nothing here
 * ever carries a max back out.
 */
import { z } from 'zod';

/** Crew-level budget output (band, dots, under-all, infeasible) needs this many maxes. */
export const BUDGET_K_MIN = 4;
/** Lock attempts per trip before `RATE_LIMITED`, so repeated locks cannot search for a max. */
export const BUDGET_LOCKS_PER_HOUR = 3;
export const BUDGET_LOCKS_PER_DAY = 10;
/** A single submission waits this long before the band moves, unless a second one lands first. */
export const BUDGET_RECOMPUTE_DEBOUNCE_MINUTES = 10;
export const BUDGET_RECOMPUTE_MIN_SUBMISSIONS = 2;

export const BUDGET_MAX_SOURCES = ['entered', 'profile_default'] as const;
export const budgetMaxSourceSchema = z.enum(BUDGET_MAX_SOURCES);
export type BudgetMaxSource = z.infer<typeof budgetMaxSourceSchema>;

const currency = z.string().regex(/^[A-Z]{3}$/u, 'ISO 4217 code');
/** Up to 10 million major units in any currency with exponent ≤ 2 (and a lot of dong). */
const amountMinor = z.int().min(1).max(100_000_000_000);

export const submitBudgetMaxPayloadSchema = z.strictObject({
  trip_id: z.uuid(),
  amount_minor: amountMinor,
  currency,
  source: budgetMaxSourceSchema.default('entered'),
});
export type SubmitBudgetMaxPayload = z.infer<typeof submitBudgetMaxPayloadSchema>;

export const setBudgetDefaultPayloadSchema = z.strictObject({
  /** `null` forgets the default. */
  amount_minor: amountMinor.nullable(),
  currency,
});
export type SetBudgetDefaultPayload = z.infer<typeof setBudgetDefaultPayloadSchema>;

export const lockBudgetTargetPayloadSchema = z.strictObject({
  trip_id: z.uuid(),
  target_minor: amountMinor,
});
export type LockBudgetTargetPayload = z.infer<typeof lockBudgetTargetPayloadSchema>;

/** A submit answers only that the max is set: no amount, no conversion, no count of others. */
export interface SubmitBudgetMaxResult {
  readonly trip_id: string;
  readonly set: true;
}

export interface LockBudgetTargetResult {
  readonly trip_id: string;
  readonly target_minor: number;
  readonly currency: string;
  /** False below the crew-level threshold: the lock consulted nobody's max. */
  readonly checked_against_band: boolean;
}

/** `GET /v1/budget/{trip_id}/band` (k ≥ 4 only; below that `K_ANON_UNAVAILABLE`). */
export interface BudgetBandWire {
  readonly trip_id: string;
  readonly currency: string;
  readonly maxes_count: number;
  readonly member_count: number;
  readonly low_minor: number;
  readonly high_minor: number;
  readonly step_minor: number;
  /** Bucketed anonymous positions in [0, 1]; `null` when dots are switched off. */
  readonly dots: readonly number[] | null;
  readonly under_all_ok: boolean;
  /** The lowest max sits below the cheapest workable plan (anonymous). */
  readonly infeasible: boolean;
  readonly computed_at: string;
}

/**
 * `K_ANON_UNAVAILABLE` detail below four maxes: the counts, plus the crew currency and the step a
 * target must sit on. Both are public price facts; nothing here derives from a max.
 */
export interface BudgetBandUnavailableDetail {
  readonly maxes_count: number;
  readonly member_count: number;
  readonly currency: string;
  readonly step_minor: number;
}

export const OWN_FIT_STATES = ['no_max', 'no_target', 'fits', 'over'] as const;
export type OwnFitState = (typeof OWN_FIT_STATES)[number];

/** A member's private fit against the organiser's current target; only ever about the caller. */
export interface OwnFitWire {
  readonly trip_id: string;
  readonly state: OwnFitState;
}

/** `GET /v1/me/private/budget_max`: the owner's own value for their `local_private` cache. */
export interface PrivateBudgetMaxWire {
  readonly trip_id: string;
  readonly amount_minor: number;
  readonly currency: string;
  readonly source: BudgetMaxSource;
  readonly updated_at: string;
}

export const PRIVATE_READ_KINDS = ['budget_max', 'budget_default'] as const;
export const privateReadKindSchema = z.enum(PRIVATE_READ_KINDS);
export type PrivateReadKind = z.infer<typeof privateReadKindSchema>;
