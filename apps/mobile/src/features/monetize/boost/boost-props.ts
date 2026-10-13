import type { StorePlatform } from '@cp/domain';
import type { BoostModel, BoostOption, SeatedMember, WhoPays } from './boost-model';

export interface BoostViewProps {
  readonly model: BoostModel;
  readonly destination: string;
  readonly crew: string;
  /** The trip's dates, formatted; empty while they are not set. */
  readonly dates: string;
  /** The boost's last day, formatted; null while the trip has no end date. */
  readonly windowEnd: string | null;
  readonly seated: readonly SeatedMember[];
  readonly store: StorePlatform | null;
  readonly onOption: (option: BoostOption) => void;
  readonly onWhoPays: (who: WhoPays) => void;
  readonly onBuy: () => void;
  readonly onCheckAgain: () => void;
  readonly onTerms: () => void;
  readonly onPrivacy: () => void;
}
