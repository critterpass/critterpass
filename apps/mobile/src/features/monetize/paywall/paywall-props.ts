import type { StorePlatform } from '@cp/domain';
import type { RestoreState } from '../data/use-billing';
import type { PerkLine } from '../perks/perk-copy';
import type { BillingPeriod, PaywallModel } from './paywall-model';

export interface PaywallViewProps {
  readonly model: PaywallModel;
  readonly holder: string;
  readonly store: StorePlatform | null;
  readonly passPerks: readonly PerkLine[];
  readonly boostPerks: readonly PerkLine[];
  /** The crew's first trip free, only while its grant is live. */
  readonly firstTripFree: { readonly crew: string; readonly until: string } | null;
  readonly boostTrip: { readonly name: string } | null;
  readonly restore: RestoreState;
  readonly onPeriod: (period: BillingPeriod) => void;
  readonly onBuy: () => void;
  readonly onCheckAgain: () => void;
  readonly onRestore: () => void;
  readonly onCompare: () => void;
  readonly onBoost: () => void;
  readonly onPlan: () => void;
  readonly onTerms: () => void;
  readonly onPrivacy: () => void;
}
