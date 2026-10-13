import type { StorePlatform } from '@cp/domain';
import type { PerkLine } from '../perks/perk-copy';
import type { PlanModel } from './plan-model';

/** One month on the pause bars: the trip month stays active. */
export interface PauseMonth {
  /** Narrow label ("N"). */
  readonly label: string;
  /** Full name for screen readers ("November"). */
  readonly name: string;
  readonly paused: boolean;
  /** The trip month that stays active. */
  readonly trip?: boolean;
}

export interface CancelViewProps {
  readonly plan: PlanModel;
  readonly store: StorePlatform | null;
  /** The next trip, when there is one to pause until. */
  readonly nextTrip: { readonly name: string; readonly months: readonly PauseMonth[] } | null;
  /** What Pass+ gives today, from the server's list. */
  readonly perks: readonly PerkLine[];
  readonly onPause: () => void;
  readonly onKeep: () => void;
  readonly onCancel: () => void;
  readonly onBack?: (() => void) | undefined;
}
