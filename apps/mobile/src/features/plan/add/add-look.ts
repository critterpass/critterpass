/** Add to plan's props and the pieces its look draws. */
import type { ComponentType, ReactNode } from 'react';

import type { RoutePreset } from './routes';

import { type DayChip, type Reason } from '@/ui/premium/planning/planning-shapes';
import { type StackMember } from '@/ui/premium/planning/planning-shapes';

export interface AddSheetProps {
  readonly tripId: string;
  /** A place id, or a dropped pin's idea id. */
  readonly placeId: string;
  readonly preset: RoutePreset;
  /** "+ right after this stop": the stop's stable id. */
  readonly afterStableId?: string | undefined;
  /** How the sheet is drawn; the logic is the same in every look. */
  readonly look: AddSheetLook;
}

/** The pieces a look of Add to plan draws: the sheet, the block in its day, who's going. */
export interface AddSheetLook {
  readonly View: ComponentType<AddSheetViewProps>;
  readonly Block: ComponentType<AddBlockProps>;
  readonly Who: ComponentType<WhoGoingProps>;
}

export interface AddBlockProps {
  readonly leave: string | null;
  readonly time: string;
  readonly length: string;
  readonly name: string;
  readonly detail: string;
  readonly editingTime: boolean;
  readonly onTime: () => void;
  readonly start: number;
  readonly end: number;
  readonly onTimeChange: (start: number, end: number) => void;
  readonly nearby: {
    readonly time: string;
    readonly text: string;
    readonly picked: boolean;
    readonly onToggle: () => void;
  } | null;
}

export interface AddSheetViewProps {
  readonly name: string;
  readonly line: string;
  readonly days: readonly DayChip[];
  readonly dayNo: number | null;
  readonly onDay: (dayNo: number) => void;
  /** Tokek's own day, one tap away, when the sheet opened on another. */
  readonly guidePick?: { readonly label: string; readonly onPress: () => void } | null;
  readonly dayHeader: string;
  readonly block: ReactNode;
  readonly whyTitle: string;
  readonly reasons: readonly Reason[];
  /** "Nowhere fits yet", or the offline note, in place of the reasons. */
  readonly note: string | null;
  readonly who: ReactNode;
  /** The first start that works, one tap away, when the chosen time is taken. */
  readonly useStart?: { readonly time: string; readonly onPress: () => void } | null;
  /** Above the button, for a member: confirming starts a crew vote. */
  readonly voteNote?: string | null;
  readonly cta: string;
  readonly busy: boolean;
  readonly disabled: boolean;
  readonly onAdd: () => void;
  readonly onSaveLater: (() => void) | null;
}

export interface WhoGoingProps {
  readonly members: readonly StackMember[];
  /** Who is left out (empty: everyone goes). */
  readonly out: ReadonlySet<string>;
  readonly open: boolean;
  readonly onOpen: () => void;
  readonly onToggle: (uid: string) => void;
}
