import type { StepProps } from '../shell/frame';
import { type PerPerson, type PlanStay, type RoomsPlan } from './model';
import type { RoomChipKey } from './copy';

export type RoomsNotice =
  'conflict' | 'lock_offline' | 'lock_failed' | 'stay_failed' | 'stay_unavailable' | null;

export interface RoomsModel {
  readonly plan: RoomsPlan | null;
  readonly stays: readonly StayOption[];
  /** The chosen stay type is no longer offered (re-pick). */
  readonly stayUnavailable: boolean;
  readonly price: PerPerson | null;
  readonly currency: string | null;
  readonly skippable: boolean;
  readonly notice: RoomsNotice;
  readonly myChips: readonly RoomChipKey[];
  readonly swapAsked: boolean;
  readonly locking: boolean;
}

export interface RoomsActions {
  readonly onMove: (stay: PlanStay, moved: { uid: string; roomKey: string }) => void;
  readonly onSeparate: (stayKey: string, separate: boolean) => void;
  readonly onPickStay: (type: string) => void;
  readonly onLock: () => void;
  readonly onSkip: () => void;
  readonly onToggleChip: (chip: RoomChipKey) => void;
  readonly onAskSwap: () => void;
}

/** What a look of the rooms step draws from. */
export type RoomsViewProps = StepProps & {
  readonly model: RoomsModel;
  readonly actions: RoomsActions;
  readonly initialReject?: { readonly stayKey: string; readonly roomKey: string } | undefined;
};

export interface StayOption {
  readonly type: string;
  /** "₫180,000–₫470,000" per room per night, already formatted. */
  readonly text: string;
  /** The currency the figures are quoted in when they could not be put in the crew's own. */
  readonly quotedIn?: string | null;
}
