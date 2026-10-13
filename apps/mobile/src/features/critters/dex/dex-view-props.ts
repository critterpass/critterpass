import type { ReactNode } from 'react';

import type { EggCard as EggCardModel } from '../hatch/hatch-model';
import type { DexFilter, DexModel } from './dex-model';
import type { SlippedAway } from './slipped-away';

/** What the Critterdex (8.01) draws from: the count and filters, the trip egg, the sets. */
export interface DexViewProps {
  readonly state: 'loading' | 'ready';
  readonly model: DexModel;
  readonly near: ReadonlySet<string>;
  readonly filter: DexFilter;
  readonly onFilter: (filter: DexFilter) => void;
  readonly query: string;
  readonly onQuery: (query: string) => void;
  readonly egg: EggCardModel | null;
  readonly hatching?: boolean;
  readonly onHatch: () => void;
  readonly onOpenHatch: () => void;
  /** Null without a home set. */
  readonly exploreAtHome: boolean | null;
  readonly onExploreAtHome: (on: boolean) => void;
  readonly onOpenSet: (setId: string) => void;
  readonly onOpenCritter: (critterId: string) => void;
  /** Where to find a form not found yet: its places, window and steps. */
  readonly onOpenWhere?: (formId: string) => void;
  readonly onOpenLegendaries: () => void;
  /** NEAR ME's map of the trip's critter spots, above the matching sets. */
  readonly nearMap?: ReactNode;
  /** The earned stickers' shelf, under the cards and above the sets. */
  readonly shelf?: ReactNode;
  /**
   * A critter that has just been added to the pass: the list scrolls to its set and outlines the
   * row for a moment, then calls `onLandedShown`.
   */
  readonly landed?: string | null;
  readonly onLandedShown?: () => void;
  /** A find the server could not confirm, told once until dismissed. */
  readonly slippedAway?: SlippedAway | null;
  readonly onDismissSlipped?: () => void;
}
