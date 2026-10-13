/** What the place page's views are given: the page, its crew rows and when it fits. */
import type { PlaceMediaAsset } from '@cp/domain';
import type { ReactNode } from 'react';
import type { GuideFacts } from '../format';
import type { FactTiles } from './context';
import { type StackMember } from '@/ui/people/AvatarStack';
import type { FitBars, FitDayView } from './context';

export interface PlaceDetailViewProps {
  readonly name: string;
  readonly category: string;
  readonly guide: GuideFacts;
  readonly photo: PlaceMediaAsset | null;
  readonly heroUrl: string | null;
  readonly heroCredit?: string | undefined;
  readonly saved: boolean;
  readonly offline: boolean;
  readonly onBack: () => void;
  readonly onShare: () => void;
  readonly onToggleSave: () => void;
  /** "SAVED BY ALEX + RIN". */
  readonly savedBy: string | null;
  /** "CREW SPLIT 2–2", opening the split. */
  readonly split: { readonly label: string; readonly onPress: (() => void) | undefined } | null;
  readonly meta: readonly string[];
  readonly facts: FactTiles | null;
  readonly fits: Omit<WhenItFitsProps, 'guide'> | null;
  /** What the page says when there is no fit to show (no trip, hours not known). */
  readonly fitNote: string | null;
  readonly crew: CrewRowProps | null;
  /** 7e-2: the tip, what to know, nearby, similar and the kept live and partner blocks. */
  readonly further: ReactNode;
  readonly cta: {
    readonly label: string;
    readonly tone: 'yellow' | 'green';
    readonly disabled: boolean;
    readonly busy: boolean;
    readonly onPress: () => void;
  };
  readonly onChat?: (() => void) | undefined;
  /** GO: the route from here, then directions in the maps app. */
  readonly onGo?: (() => void) | undefined;
}

export interface CrewRowProps {
  /** Crewmates who saved the place or said yes to it, in the crew's own order. */
  readonly keen: readonly StackMember[];
  /** The crew's Q&A line about the place, when the chat has one. */
  readonly qna: string | null;
  /**
   * The faces are who saved it (the planning place page): "Alex and Rin saved it." leads, then
   * the Q&A line.
   */
  readonly savers?: boolean | undefined;
}

export interface WhenItFitsProps {
  readonly guide: GuideFacts;
  readonly best: FitDayView;
  readonly sentence: string | null;
  readonly bars: FitBars | null;
  /**
   * The place is already a stop: the card leads with where it is ("In the plan · Mon 5 at 14:00")
   * and whether it fits there, and the best slot, when it is another, is a second line.
   */
  readonly planned?: {
    readonly date: string;
    readonly time: string | null;
    readonly grade: FitDayView['grade'] | null;
  } | null;
  /** Opens the day picker; absent while Add to plan is not in the app. */
  readonly onOtherDays?: (() => void) | undefined;
}
