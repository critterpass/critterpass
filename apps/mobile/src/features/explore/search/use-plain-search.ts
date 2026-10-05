/**
 * Asking in plain words (7d-2): the question goes to the parse route once, its chips land, then
 * the place search runs with them. Taking a chip off reruns only the search (no model call); an
 * answer for an older set of chips is dropped, so the list never jumps back. A declined or failed
 * parse searches the whole question by name, with no chips. A new question remounts the hook
 * (the screen keys it by the question).
 */
/* eslint-disable lingui/no-unlocalized-strings -- api paths and wire values, never copy. */
import {
  searchParseResultSchema,
  type ExcludeReason,
  type SearchChip,
  type SearchFilter,
} from '@cp/domain';
import { useEffect, useReducer } from 'react';

import { useSearchServices } from './data/search-services';
import {
  chipKey,
  filtersWithout,
  plainSearchQuery,
  readPlainAnswer,
  type PlainAnswer,
} from './plain-filters';

export interface PlainState {
  readonly question: string;
  readonly parse: 'parsing' | 'done';
  readonly filters: SearchFilter;
  readonly chips: readonly SearchChip[];
  readonly excludeReason: ExcludeReason | null;
  /** Bumped whenever the filters change; an answer for an older one is stale. */
  readonly round: number;
  readonly search: 'idle' | 'loading' | 'ready' | 'failed' | 'offline';
  readonly answer: PlainAnswer | null;
}

export type PlainAction =
  | { readonly type: 'ask'; readonly question: string }
  | {
      readonly type: 'parsed';
      readonly question: string;
      readonly filters: SearchFilter;
      readonly chips: readonly SearchChip[];
      readonly excludeReason: ExcludeReason | null;
    }
  | { readonly type: 'remove'; readonly key: string }
  /** A way out (7d-4): its filters, rerun without the model. */
  | { readonly type: 'relax'; readonly filters: SearchFilter }
  /** The same filters again, after a search that failed. */
  | { readonly type: 'retry' }
  | { readonly type: 'answered'; readonly round: number; readonly answer: PlainAnswer }
  | { readonly type: 'failed'; readonly round: number; readonly offline: boolean };

export function initialPlain(question: string): PlainState {
  return {
    question,
    parse: 'parsing',
    filters: { text: question },
    chips: [],
    excludeReason: null,
    round: 0,
    search: 'idle',
    answer: null,
  };
}

export function plainReducer(state: PlainState, action: PlainAction): PlainState {
  switch (action.type) {
    case 'ask':
      return { ...initialPlain(action.question), round: state.round + 1 };
    case 'parsed':
      if (action.question !== state.question) return state;
      return {
        ...state,
        parse: 'done',
        filters: action.filters,
        chips: action.chips,
        excludeReason: action.excludeReason,
        round: state.round + 1,
        search: 'loading',
      };
    case 'remove': {
      const chip = state.chips.find((entry) => chipKey(entry) === action.key);
      if (chip === undefined) return state;
      return {
        ...state,
        filters: filtersWithout(state.filters, chip),
        chips: state.chips.filter((entry) => entry !== chip),
        excludeReason: chip.code === 'exclude_days' ? null : state.excludeReason,
        round: state.round + 1,
        // The last list stays on screen while the new one loads, so rows reshuffle in place.
        search: 'loading',
      };
    }
    case 'relax':
      return {
        ...state,
        filters: action.filters,
        chips: state.chips.flatMap((chip): SearchChip[] => {
          if (chip.code !== 'max_minutes') return [chip];
          const max = action.filters.max_minutes;
          return max === undefined ? [] : [{ code: 'max_minutes', params: max }];
        }),
        round: state.round + 1,
        search: 'loading',
        answer: null,
      };
    case 'retry':
      if (state.parse !== 'done') return state;
      return { ...state, round: state.round + 1, search: 'loading' };
    case 'answered':
      if (action.round !== state.round) return state;
      return { ...state, search: 'ready', answer: action.answer };
    case 'failed':
      if (action.round !== state.round) return state;
      return { ...state, search: action.offline ? 'offline' : 'failed' };
  }
}

/** The parse's answer, or the whole question searched by name. */
export function parsedOrName(
  question: string,
  body: unknown,
): Omit<Extract<PlainAction, { type: 'parsed' }>, 'type'> {
  const parsed = searchParseResultSchema.safeParse(body);
  if (!parsed.success)
    return { question, filters: { text: question }, chips: [], excludeReason: null };
  return {
    question,
    filters: parsed.data.filters,
    chips: parsed.data.chips,
    excludeReason: parsed.data.exclude_reason ?? null,
  };
}

export function usePlainSearch(input: {
  readonly tripId: string;
  readonly destinationId: string | null;
  readonly question: string;
}) {
  const services = useSearchServices();
  const { tripId, destinationId, question } = input;
  const [state, dispatch] = useReducer(plainReducer, question, initialPlain);

  useEffect(() => {
    if (state.parse !== 'parsing') return undefined;
    let live = true;
    void services
      .postJson(`/v1/trips/${tripId}/search/parse`, { q: state.question })
      .then((read) => {
        if (!live) return;
        dispatch({
          type: 'parsed',
          ...parsedOrName(state.question, read.kind === 'ok' ? read.body : null),
        });
      });
    return () => {
      live = false;
    };
  }, [services, tripId, state.parse, state.question]);

  const { round, filters, parse } = state;
  useEffect(() => {
    if (parse !== 'done') return;
    void services
      .getJson(plainSearchQuery(filters, { tripId, destinationId }, question))
      .then((read) => {
        if (read.kind === 'ok')
          dispatch({ type: 'answered', round, answer: readPlainAnswer(read.body) });
        else dispatch({ type: 'failed', round, offline: read.kind === 'offline' });
      });
  }, [services, tripId, destinationId, round, filters, parse, question]);

  return {
    state,
    remove: (key: string) => dispatch({ type: 'remove', key }),
    relax: (filters: SearchFilter) => dispatch({ type: 'relax', filters }),
    retry: () => dispatch({ type: 'retry' }),
  };
}
