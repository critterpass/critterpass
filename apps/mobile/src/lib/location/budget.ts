/**
 * The battery budget the engine applies on every fix: accuracy tier from where the user is and
 * what runs (`@cp/domain` `chooseAccuracy`), the per-day high-accuracy allowance (server config,
 * default 90 min) keyed on the device's local date, and the update count kept as the energy proxy.
 */
import {
  chooseAccuracy,
  DEFAULT_HIGH_ACCURACY_CAP_MS,
  highAccuracyUsedMs,
  initialBudget,
  recordTier,
  recordUpdate,
  rollBudget,
  toLocalWallTime,
  type AccuracyNeeds,
  type AccuracyTier,
  type BudgetState,
} from '@cp/domain';

export interface BudgetOptions {
  readonly now: () => number;
  readonly deviceTz: () => string;
  readonly capMs?: () => number | undefined;
}

export interface BudgetSnapshot {
  readonly day: string;
  readonly highAccuracyMs: number;
  readonly updates: number;
}

export function createBudget(options: BudgetOptions) {
  const dayOf = (at: number) => toLocalWallTime(new Date(at), options.deviceTz()).date;
  let state: BudgetState = initialBudget(dayOf(options.now()));

  function roll(): number {
    const now = options.now();
    state = rollBudget(state, dayOf(now), now);
    return now;
  }

  return {
    /** The tier for these needs right now; opens or closes the high-accuracy stretch. */
    decide(needs: AccuracyNeeds): AccuracyTier {
      const now = roll();
      const tier = chooseAccuracy(
        needs,
        state,
        now,
        options.capMs?.() ?? DEFAULT_HIGH_ACCURACY_CAP_MS,
      );
      state = recordTier(state, tier, now);
      return tier;
    },
    recordUpdate(): void {
      roll();
      state = recordUpdate(state);
    },
    /** Closes any open stretch (session stopped). */
    close(): void {
      state = recordTier(state, 'paused', roll());
    },
    snapshot(): BudgetSnapshot {
      const now = roll();
      return {
        day: state.day,
        highAccuracyMs: highAccuracyUsedMs(state, now),
        updates: state.updates,
      };
    },
  };
}

export type Budget = ReturnType<typeof createBudget>;
