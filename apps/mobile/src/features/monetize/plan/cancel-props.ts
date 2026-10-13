import type { StorePlatform } from '@cp/domain';
import type { PauseMonth } from '@/ui/monetize/PauseBars';
import type { PerkLine } from '../perks/perk-copy';
import type { PlanModel } from './plan-model';

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
