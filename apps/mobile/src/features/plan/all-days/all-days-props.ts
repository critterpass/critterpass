import type { GettingThereState } from '@/data/areas/use-getting-there';
import type { TripMapModel } from '../trip-map/sheet-props';
import type { CardRect, MovePlan } from './use-cross-day-drag';
import type { DayItem } from '@/data/plan/plan-model';
import type { TripPlan } from '@/data/plan/use-trip-plan';
import type { TripDay } from '../trip-map/trip-days';

export interface AllDaysViewProps {
  readonly model: TripMapModel;
  /** The day it was opened from (← goes back to it). */
  readonly from: TripDay | null;
  readonly over: number | null;
  readonly dragging: boolean;
  readonly measureKey: number;
  /** The ways from the reader's home city to the destination; absent when there is nothing to ask. */
  readonly gettingThere?: GettingThereState | null;
  readonly onRetryGettingThere?: () => void;
  readonly onBack: () => void;
  readonly onShare: () => void;
  readonly onOpenDay: (dayNo: number) => void;
  readonly onMoveMenu: (dayNo: number) => void;
  readonly onRect: (rect: CardRect) => void;
  readonly onHold: (stop: DayItem, dayNo: number) => void;
  readonly onDrag: (x: number, y: number) => void;
  readonly onDrop: (x: number, y: number) => void;
}

export interface MovePreviewProps {
  readonly stop: DayItem;
  readonly plan: MovePlan;
  readonly canApply: boolean;
  readonly onConfirm: () => void;
  readonly onClose: () => void;
}

export interface MoveStopSheetProps {
  readonly day: TripDay;
  readonly days: readonly TripDay[];
  readonly onPick: (stop: DayItem, to: number) => void;
  readonly onClose: () => void;
}

export interface ShareSheetProps {
  readonly plan: TripPlan;
  /** The plan's days as the screen shows them. */
  readonly days: readonly TripDay[];
  readonly onClose: () => void;
}
