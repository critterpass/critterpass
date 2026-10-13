import type { ProfileStamp } from './stamp-book';

export interface StampsViewProps {
  /** Null while the first read is still out. */
  readonly stamps: readonly ProfileStamp[] | null;
  readonly year: number | null;
  readonly onYear: (year: number | null) => void;
  readonly onBack?: () => void;
  readonly onAddPastTrip: () => void;
  /** Opens a stamp: a self-reported trip's form, or a trip's recap; absent when it has none. */
  readonly openerFor: (stamp: ProfileStamp) => (() => void) | undefined;
}
