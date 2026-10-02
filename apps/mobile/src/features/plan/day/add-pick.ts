/** The add sheet's place pick: picking folds the list to the place, and it can be changed. */
import type { PlaceRow } from './queries';

/** The place picked from the list, and whether the list is open again to change it. */
export interface PickState {
  readonly place: PlaceRow | null;
  readonly browsing: boolean;
}

export type PickAction =
  | { readonly type: 'pick'; readonly place: PlaceRow }
  | { readonly type: 'browse' }
  | { readonly type: 'clear' };

export const NO_PICK: PickState = { place: null, browsing: false };

/** A pick folds the list; browsing opens it again with the pick kept; a new search drops it. */
export function pickStep(state: PickState, action: PickAction): PickState {
  switch (action.type) {
    case 'pick':
      return { place: action.place, browsing: false };
    case 'browse':
      return state.place === null || state.browsing ? state : { ...state, browsing: true };
    case 'clear':
      return state.place === null ? state : NO_PICK;
  }
}

/** The rows the list shows: all of them, or only the pick while it is folded. */
export function shownPlaces(rows: readonly PlaceRow[], state: PickState): readonly PlaceRow[] {
  return state.place === null || state.browsing ? rows : [state.place];
}
