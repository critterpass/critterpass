/** What the swipe deck's views are given: the stage, the cards, the summary and the match stamp. */
import { type MatchOutcome } from './trip-explore/swipe-outcome';
import { type StackMember } from '@/ui/people/AvatarStack';
import { type DeckWait } from './deck-wait';
import type { GuideFacts } from './format';
import type { Verdict, WhyLine } from './swipe-model';
import type { PlaceMediaAsset } from '@cp/domain';

export type SwipeStage =
  | {
      readonly kind: 'building';
      readonly wait: DeckWait;
      readonly onRetry?: (() => void) | undefined;
    }
  | {
      readonly kind: 'deck';
      readonly top: SwipeCardFace;
      readonly under: SwipeCardFace | null;
      readonly why: readonly WhyLine[];
    }
  | ({ readonly kind: 'summary' } & Omit<DeckSummaryProps, 'guideName' | 'onDone'>);

export interface SwipeViewProps {
  /** Already worded: "Bali · Oct 12–19". */
  readonly eyebrow: string;
  readonly guide: GuideFacts;
  readonly live: readonly StackMember[];
  readonly done: number;
  readonly total: number;
  readonly matchCount: number;
  readonly offline: boolean;
  readonly stage: SwipeStage;
  readonly whyOpen: boolean;
  readonly onWhy: (open: boolean) => void;
  readonly onSwipe: (poiId: string, verdict: Verdict) => void;
  readonly onUndo?: (() => void) | undefined;
  /** The match to stamp now. */
  readonly match: MatchStampProps | null;
  readonly onBack: () => void;
}

export interface SwipeCardFace {
  readonly poiId: string;
  readonly name: string;
  readonly category: string;
  /** Already worded: "Temple · near the stay". */
  readonly meta: string;
  /** The guide's note for this card, when it wrote one. */
  readonly note: string | null;
  /** Already worded: "Alex + Rin said yes"; null when nobody else has. */
  readonly social: string | null;
  /** The place's own photo; null draws the category's doodle (never the destination's photo). */
  readonly photo: PlaceMediaAsset | null;
}

export interface DeckSummaryProps {
  /** The session was ended before this phone finished the deck. */
  readonly ended: boolean;
  readonly yesCount: number;
  /** Each yes saved its place to the trip's Ideas (the planning screens are on). */
  readonly savedToIdeas?: boolean | undefined;
  readonly matches: readonly {
    readonly id: string;
    readonly name: string;
    readonly dayNo: number | null;
    /** Where the match went; absent reads `dayNo`. */
    readonly outcome?: MatchOutcome | undefined;
    /** Who said yes, already worded ("Alex, Rin and you"). */
    readonly voters?: string | undefined;
  }[];
  readonly guideName: string;
  /** Opens the trip's Ideas; shown when a match went there. */
  readonly onIdeas?: (() => void) | undefined;
  readonly onDone: () => void;
}

export interface MatchStampProps {
  readonly placeName: string;
  /** The day the plan suggests for it; null when no slot was free. */
  readonly dayNo: number | null;
  /** Where the match went; absent reads `dayNo` (a suggested day, or a plain match). */
  readonly outcome?: MatchOutcome | undefined;
  /** Everyone who said yes (shown when the match went to Ideas). */
  readonly voters?: readonly StackMember[] | undefined;
  /** How long a match that went to Ideas holds before it drops away. */
  readonly holdMs?: number | undefined;
  readonly onDone: () => void;
}
