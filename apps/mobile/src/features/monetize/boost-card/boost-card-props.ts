import type { BoostCardModel } from './boost-card-model';

export interface BoostCardViewProps {
  readonly model: BoostCardModel;
  /** The buyer's first name; empty when nobody bought it (a free first trip, a gift). */
  readonly buyer: string;
  readonly destination: string;
  /** The trip's dates, formatted; empty when it has none yet. */
  readonly dates: string;
  /** Short perk chips, from the server's switched-on boost perks. */
  readonly perks: readonly string[];
  /** The viewer's share, formatted, when they owe one. */
  readonly share: string | null;
  /** The trip's guide and its line under the card; null says nothing. */
  readonly guide: { readonly id: string; readonly name: string; readonly line: string } | null;
  readonly thanking?: boolean;
  readonly onSettle: () => void;
  readonly onThanks: () => void;
}
