/** The stop sheet's look and the parts it is drawn with, and whether a stop is on today. */
import { toLocalWallTime, type PlanOp } from '@cp/domain';
import type { OverlayClash } from '@cp/planner';
import { type ComponentType, type ReactNode } from 'react';

import type { DaySlot } from '@/data/plan/plan-ops';
import { type DayItem } from '@/data/plan/plan-model';
import { type PlanMember } from '@/data/plan/use-trip-plan';

/** The stop is on the trip's own today (in the trip's time zone) and has a time. */
export function isStopOfToday(
  item: Pick<DayItem, 'start'>,
  date: string | null,
  tz: string,
  now: Date,
): boolean {
  return item.start !== null && date !== null && toLocalWallTime(now, tz).date === date;
}

/** The stop's own actions on the day it is on (check in, late, skip for me, start from now). */
export interface StopDayActionsProps {
  readonly tripId: string;
  readonly item: DayItem;
  /** The date of the stop's day ("2026-10-05"). */
  readonly date: string | null;
  readonly tz: string;
  /** Closes the sheet before another screen opens over it. */
  readonly onClose: () => void;
  readonly onSkipForMe: () => void;
  /** She travels alone: there is no "just me" to say. */
  readonly solo?: boolean;
  /** The stop's day and the plan editor: "start from now" moves the day through it (with UNDO). */
  readonly day?: {
    readonly stops: readonly DayItem[];
    readonly slot: DaySlot;
    readonly submit: (ops: readonly PlanOp[]) => void;
  };
}

/** A clash with someone's own plans: keep the stop or drop it. */
export interface ClashCardProps {
  readonly clash: OverlayClash;
  /** The stop's name. */
  readonly label: string;
  readonly onKeep: () => void;
  readonly onDrop: () => void;
}

/** The stop's comments with their own composer. */
export interface ItemCommentsProps {
  readonly tripId: string;
  readonly uid: string | null;
  readonly item: DayItem;
  readonly members: readonly PlanMember[];
  readonly guide: { readonly kind: string; readonly name: string };
}

/** How the stop's sheet and its parts are drawn; the logic is the same in every look. */
export interface ItemSheetLook {
  readonly Sheet: ComponentType<ItemDetailSheetProps>;
  readonly DayActions: ComponentType<StopDayActionsProps>;
  readonly Clash: ComponentType<ClashCardProps>;
  readonly Comments: ComponentType<ItemCommentsProps>;
}

/** What a change would do to the rest of the day, before it is saved. */
export interface ChangePreview {
  /** "3 later stops move by 1 h", or what the change runs into. */
  readonly line: string | null;
  /** The change can't be saved as it is. */
  readonly blocked: boolean;
  /** The first start that would work, offered in one tap when the chosen one is taken. */
  readonly useStart?: number;
}

export interface ItemDetailActions {
  readonly onSave: (start: number, end: number, confirmLocked: boolean) => void;
  /** Another day; `times` when the time changed with it. */
  readonly onMoveToDay: (
    dayNo: number,
    confirmLocked: boolean,
    times?: { readonly start: number; readonly end: number },
  ) => void;
  readonly onRemove: (confirmLocked: boolean) => void;
  /** Null where there is no crew plan to skip from (an organiser's own draft). */
  readonly onSkipForMe: (() => void) | null;
  readonly onOpenPlace: (poiId: string) => void;
  readonly onOpenMaps: () => void;
  readonly onClose: () => void;
}

export interface ItemDetailSheetProps {
  readonly item: DayItem;
  readonly dayNos: readonly number[];
  readonly members: readonly PlanMember[];
  readonly canApply: boolean;
  /** The plan can't be edited: the time is plain text and no move, remove, skip or save is drawn. */
  readonly readOnly?: boolean;
  readonly comments?: ReactNode;
  /** What leads the sheet on the day itself (the stop's on-the-day actions). */
  readonly lead?: ReactNode;
  readonly actions: ItemDetailActions;
  /** Each day named by its date ("Sat, Oct 17"); a day without one reads "Day 3". */
  readonly dayLabels?: ReadonlyMap<number, string>;
  /** The must-do is the reader's own. */
  readonly mustDoMine?: boolean;
  /** What taking the stop off does to the rest of its day ("3 later stops move 1 h earlier"). */
  readonly removeLine?: string | null;
  /** The place's price level (0 = known to be free); null = not known. */
  readonly priceLevel?: number | null;
  /** A change to this stop the crew is still deciding on. */
  readonly suggestion?: { readonly line: string; readonly onSee: () => void } | null;
  readonly preview?: (change: {
    readonly start: number;
    readonly end: number;
    readonly dayNo: number;
  }) => ChangePreview;
}
