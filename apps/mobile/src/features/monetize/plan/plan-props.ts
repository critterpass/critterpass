import type { RestoreState } from '../data/use-billing';
import type { CompareRowSpec } from '../perks/perk-copy';
import type { BoostLine, PlanModel } from './plan-model';

export interface PlanViewProps {
  /** Null while the rows have not been read yet. */
  readonly plan: PlanModel | null;
  /** The store's price for the current plan, when it has one. */
  readonly price: string | null;
  readonly boosts: readonly BoostLine[];
  /** What each plan includes, row by row (the free plan lists its own column). */
  readonly compare: readonly CompareRowSpec[];
  readonly restore: RestoreState;
  /** False where there is no store to restore from or manage in. */
  readonly storeAvailable: boolean;
  readonly onBack?: (() => void) | undefined;
  readonly onUpgrade: () => void;
  readonly onManageStore: () => void;
  readonly onRestore: () => void;
  /** Redeem a store offer or promo code. */
  readonly onRedeem: () => void;
  readonly onCancel: () => void;
  readonly onBillingIssue: () => void;
}
