import type { PersonView } from '../data/view-model';

export interface MeetupChoice {
  readonly place:
    | { readonly kind: 'poi'; readonly poiId: string; readonly name: string }
    | { readonly kind: 'point'; readonly lat: number; readonly lng: number; readonly name: string }
    | null;
  /** Minutes from now; null keeps the current time (a move only). */
  readonly inMinutes: number | null;
}

export interface RowModel {
  readonly key: string;
  readonly people: readonly PersonView[];
  readonly title: string;
  readonly status: string;
  readonly clock: string | null;
  readonly estimate: boolean;
  readonly spoken: string;
}
