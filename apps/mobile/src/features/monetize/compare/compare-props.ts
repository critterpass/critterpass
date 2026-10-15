import type { StorePlatform } from '@cp/domain';
import type { PaywallModel } from '../paywall/paywall-model';
import type { CompareRowSpec } from '../perks/perk-copy';

export type CompareColumn = 'free' | 'pass' | 'boost';

export interface CompareViewProps {
  readonly rows: readonly CompareRowSpec[];
  readonly model: PaywallModel;
  readonly store: StorePlatform | null;
  /** Whether there is a trip a boost could go on from here. */
  readonly canBoost: boolean;
  readonly onBuy: () => void;
  readonly onCheckAgain: () => void;
  readonly onBoost: () => void;
  readonly onTerms: () => void;
  readonly onPrivacy: () => void;
}
