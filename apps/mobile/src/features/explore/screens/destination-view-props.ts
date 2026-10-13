import type { LegendChip, MonthBarModel } from '../destination-model';
import type { CrewChoice } from '../queries';
import type { PriceRow } from '../destination-model';
import { type ReactNode } from 'react';
import type { MediaView } from '@/lib/media/variants';
import type { GuideFacts } from '../format';
import type { HeroChip } from '../guide-copy';
import type { ShownPhoto } from '../profile-photo';

export interface DestinationViewProps {
  readonly hero: DestHeroProps;
  /** The page's facts are still on their way (nothing saved to show yet). */
  readonly loading: boolean;
  readonly offline: boolean;
  /**
   * Only when the page has neither a month curve nor picks to draw. `limited`: a place nobody has
   * checked (the guest guide's, or its own guide still learning it); `writing`: a guide's own place
   * whose curve is not written yet; `unavailable`: the guide's read did not load and the phone
   * holds no places for it.
   */
  readonly notice: 'limited' | 'writing' | 'unavailable' | null;
  readonly months: {
    readonly bars: readonly MonthBarModel[];
    readonly legend: readonly LegendChip[];
    readonly selected: number | null;
    readonly onSelect: (month: number) => void;
    readonly panel: MonthPanelProps | null;
  } | null;
  readonly picks: readonly PickCard[];
  readonly onOpenPick?: ((pick: PickCard) => void) | undefined;
  /** Opens the destination's map. */
  readonly onMap?: (() => void) | undefined;
  /** Opens the crews' shared plans for this place; absent while that screen is not in the app. */
  readonly onCrewPlans?: (() => void) | undefined;
  readonly actions: DestinationActionsProps;
}

export type ActionsMode = 'actions' | 'crews' | 'solo';

export interface DestinationActionsProps {
  readonly mode: ActionsMode;
  readonly placeName: string;
  readonly guideName: string;
  readonly crews: readonly CrewChoice[];
  readonly soloBusy: boolean;
  readonly onPitch: () => void;
  readonly onPickCrew: (crewId: string) => void;
  readonly onSolo: () => void;
  readonly onConfirmSolo: () => void;
  readonly onCancel: () => void;
}

export type MonthPrices =
  | { readonly kind: 'loading' }
  | { readonly kind: 'noAirport' }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'rows'; readonly rows: readonly PriceRow[]; readonly offline: boolean };

export interface MonthPanelProps {
  /** 1–12. */
  readonly month: number;
  readonly crowd: 'quiet' | 'steady' | 'busy';
  readonly highlight: string | null;
  readonly prices: MonthPrices;
  /** Opens where the home airport is set; absent while that screen is not in the app. */
  readonly onSetHomeAirport?: (() => void) | undefined;
  readonly now?: Date;
}

export interface DestHeroProps {
  readonly name: string;
  readonly guide: GuideFacts;
  readonly tagline: string;
  /** Where back goes, as the eyebrow names it ("Explore", or the country on a guest page). */
  readonly backLabel: string;
  readonly onBack: () => void;
  /** SAVE for the destination; absent when `trailing` takes its place. */
  readonly saved?: boolean | undefined;
  readonly onToggleSave?: (() => void) | undefined;
  /** Drawn where SAVE sits (inside a trip: the crew's saved count). */
  readonly trailing?: ReactNode;
  /** Already worded facts, in display order. */
  readonly chips: readonly HeroChip[];
  /** The destination's curated media, or a pick's photo where it has none. */
  readonly photo: MediaView | null;
  /**
   * `ghost`: the paper silhouette; `seated` (the default): the guide's own sticker.
   */
  readonly guideArt?: 'ghost' | 'seated' | undefined;
  /** Space under the last line, in place of the hero's own (a bar that overlaps its bottom edge). */
  readonly bottomRoom?: number | undefined;
}

export interface PickCard {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly photo: ShownPhoto | null;
  /** A paid-for card: labelled, with the way to ask why it is shown. */
  readonly sponsored?: { readonly onWhy: () => void } | undefined;
}
