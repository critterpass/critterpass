/**
 * Add from a link (7d-3) as a state the screen draws: the post it read, then each place as the
 * server matches it, in the order it named them. Events may come in any order and twice (a match
 * before the source, a retry); each place is kept once by its label. An error mid-stream keeps
 * what was already matched; a retry starts over. Sure matches start ticked for saving; a place
 * with more than one candidate waits for a pick.
 */

import type { ImportCandidate, ImportEvent, ImportPlatform } from '@cp/domain';

type SourceData = Extract<ImportEvent, { event: 'source' }>['data'];
type ErrorCode = Extract<ImportEvent, { event: 'error' }>['data']['code'];

export type LinkMatch =
  | { readonly kind: 'sure'; readonly label: string; readonly place: ImportCandidate }
  | {
      readonly kind: 'ambiguous';
      readonly label: string;
      readonly candidates: readonly ImportCandidate[];
      readonly picked: ImportCandidate | null;
    }
  | { readonly kind: 'unknown'; readonly label: string };

export interface LinkImportState {
  readonly status: 'reading' | 'done' | 'error';
  readonly source: SourceData | null;
  readonly matches: readonly LinkMatch[];
  /** Labels whose place is ticked for saving. */
  readonly selected: ReadonlySet<string>;
  readonly error: ErrorCode | 'unreachable' | null;
}

export type LinkImportAction =
  | { readonly type: 'event'; readonly event: ImportEvent }
  | { readonly type: 'unreachable' }
  | { readonly type: 'restart' }
  | { readonly type: 'toggle'; readonly label: string }
  | { readonly type: 'pick'; readonly label: string; readonly poiId: string };

export const LINK_IMPORT_START: LinkImportState = {
  status: 'reading',
  source: null,
  matches: [],
  selected: new Set(),
  error: null,
};

function upsert(matches: readonly LinkMatch[], next: LinkMatch): LinkMatch[] {
  const at = matches.findIndex((match) => match.label === next.label);
  if (at === -1) return [...matches, next];
  return matches.map((match, index) => (index === at ? next : match));
}

function withSelection(selected: ReadonlySet<string>, label: string, on: boolean): Set<string> {
  const next = new Set(selected);
  if (on) next.add(label);
  else next.delete(label);
  return next;
}

function onEvent(state: LinkImportState, event: ImportEvent): LinkImportState {
  switch (event.event) {
    case 'source':
      return { ...state, source: event.data };
    case 'match': {
      const { label, ...place } = event.data;
      return {
        ...state,
        matches: upsert(state.matches, { kind: 'sure', label, place }),
        selected: withSelection(state.selected, label, true),
      };
    }
    case 'ambiguous':
      return {
        ...state,
        matches: upsert(state.matches, {
          kind: 'ambiguous',
          label: event.data.label,
          candidates: event.data.candidates,
          picked: null,
        }),
        selected: withSelection(state.selected, event.data.label, false),
      };
    case 'unknown':
      return {
        ...state,
        matches: upsert(state.matches, { kind: 'unknown', label: event.data.label }),
        selected: withSelection(state.selected, event.data.label, false),
      };
    case 'done':
      return state.status === 'error' ? state : { ...state, status: 'done' };
    case 'error':
      return { ...state, status: 'error', error: event.data.code };
  }
}

export function linkImportReducer(
  state: LinkImportState,
  action: LinkImportAction,
): LinkImportState {
  switch (action.type) {
    case 'event':
      return onEvent(state, action.event);
    case 'unreachable':
      return state.status !== 'reading'
        ? state
        : { ...state, status: 'error', error: 'unreachable' };
    case 'restart':
      return LINK_IMPORT_START;
    case 'toggle': {
      const match = state.matches.find((entry) => entry.label === action.label);
      const pickable =
        match?.kind === 'sure' || (match?.kind === 'ambiguous' && match.picked !== null);
      if (!pickable) return state;
      return {
        ...state,
        selected: withSelection(state.selected, action.label, !state.selected.has(action.label)),
      };
    }
    case 'pick': {
      const matches = state.matches.map((match) => {
        if (match.kind !== 'ambiguous' || match.label !== action.label) return match;
        const picked = match.candidates.find((candidate) => candidate.poi_id === action.poiId);
        return picked === undefined ? match : { ...match, picked };
      });
      return { ...state, matches, selected: withSelection(state.selected, action.label, true) };
    }
  }
}

/** The places ticked for saving, once each. */
export function chosenPlaces(state: LinkImportState): ImportCandidate[] {
  const seen = new Set<string>();
  return state.matches.flatMap((match) => {
    if (!state.selected.has(match.label)) return [];
    const place =
      match.kind === 'sure' ? match.place : match.kind === 'ambiguous' ? match.picked : null;
    if (place === null || seen.has(place.poi_id)) return [];
    seen.add(place.poi_id);
    return [place];
  });
}

/** The day most of the chosen places fit best (the earliest on a tie), or null. */
export function sharedBestDay(places: readonly ImportCandidate[]): number | null {
  const votes = new Map<number, number>();
  for (const place of places) {
    const best = place.fit_best;
    if (best === null || best === undefined || best.grade === 'no') continue;
    votes.set(best.day_no, (votes.get(best.day_no) ?? 0) + 1);
  }
  let chosen: number | null = null;
  for (const [day, count] of votes) {
    const current = chosen === null ? 0 : (votes.get(chosen) ?? 0);
    if (count > current || (count === current && chosen !== null && day < chosen)) chosen = day;
  }
  return chosen;
}

export function platformOfSource(state: LinkImportState): ImportPlatform | null {
  return state.source?.platform ?? null;
}
