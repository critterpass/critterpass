/**
 * Plain words: chips arrive from the parse, taking one off reruns the search without it (and
 * without the model), and an answer for chips already changed is dropped so the list never jumps
 * back to an older question.
 */
import type { SearchChip, SearchParseResult } from '@cp/domain';
import { describe, expect, it } from '@jest/globals';

import { onlyDayLeft } from '../chip-words';
import {
  chipKey,
  filtersFor,
  plainSearchQuery,
  readPlainAnswer,
  type PlainAnswer,
} from '../plain-filters';
import { initialPlain, parsedOrName, plainReducer, type PlainState } from '../use-plain-search';

const WED = '0199a3f0-0000-7000-8000-00000000da03';
const QUESTION = 'quiet dinner near the villa, open late';

const parse: SearchParseResult = {
  filters: {
    meal: 'dinner',
    attributes: ['quiet'],
    max_minutes: { from: 'stay', minutes: 15 },
    open_past: '22:00',
    exclude_day_ids: [WED],
  },
  chips: [
    { code: 'meal', params: { meal: 'dinner' } },
    { code: 'attribute', params: { attribute: 'quiet' } },
    { code: 'max_minutes', params: { from: 'stay', minutes: 15 } },
    { code: 'open_past', params: { time: '22:00' } },
    { code: 'exclude_days', params: { day_ids: [WED] } },
  ],
  exclude_reason: { code: 'day_has_meal', params: { day_ids: [WED] } },
};

const answer = (names: string[]): PlainAnswer => ({
  places: names.map((name, index) => ({
    id: `0199a3f0-0000-7000-8000-0000000000${String(10 + index)}`,
    name,
    category: 'food',
    area: 'Ubud',
    minutes: null,
    closesAt: null,
    fit: null,
  })),
  softMisses: [],
  waysOut: [],
  close: null,
  nearest: null,
});

const notWed = parse.chips[4] as SearchChip;

function parsed(): PlainState {
  return plainReducer(initialPlain(QUESTION), { type: 'parsed', ...parsedOrName(QUESTION, parse) });
}

describe('plain-words search', () => {
  it('lands the parse’s chips and starts the search', () => {
    const state = parsed();
    expect(state.chips.map(chipKey)).toEqual([
      'meal:dinner',
      'attribute:quiet',
      'max_minutes',
      'open_past',
      'exclude_days',
    ]);
    expect([state.search, state.excludeReason?.code]).toEqual(['loading', 'day_has_meal']);
    const query = new URLSearchParams(
      plainSearchQuery(state.filters, { tripId: 't', destinationId: 'd' }).split('?')[1],
    );
    expect(Object.fromEntries(query)).toMatchObject({
      meal: 'dinner',
      attrs: 'quiet',
      max_minutes: 'stay:15',
      open_past: '22:00',
      exclude_day_ids: WED,
      fit: '1',
    });
  });

  it('taking NOT WED off drops only that filter and its note, keeping the list while it reloads', () => {
    const shown = plainReducer(parsed(), {
      type: 'answered',
      round: 1,
      answer: answer(['Sayan House']),
    });
    const removed = plainReducer(shown, { type: 'remove', key: chipKey(notWed) });
    expect(removed.filters.exclude_day_ids).toBeUndefined();
    expect(removed.filters.meal).toBe('dinner');
    expect(removed.excludeReason).toBeNull();
    expect(removed.chips).toHaveLength(4);
    expect([removed.search, removed.answer?.places[0]?.name]).toEqual(['loading', 'Sayan House']);
    expect(removed.round).toBe(shown.round + 1);
  });

  it('drops an answer for chips that have since changed', () => {
    const first = parsed();
    const removed = plainReducer(first, { type: 'remove', key: 'attribute:quiet' });
    const late = plainReducer(removed, {
      type: 'answered',
      round: first.round,
      answer: answer(['Old']),
    });
    expect(late.answer).toBeNull();
    const fresh = plainReducer(late, {
      type: 'answered',
      round: removed.round,
      answer: answer(['Locavore', 'Bridges']),
    });
    expect(fresh.answer?.places.map((place) => place.name)).toEqual(['Locavore', 'Bridges']);
    const failedLate = plainReducer(fresh, { type: 'failed', round: first.round, offline: true });
    expect(failedLate.search).toBe('ready');
  });

  it('searches the whole question by name when the parse is declined or fails', () => {
    expect(parsedOrName(QUESTION, null)).toEqual({
      question: QUESTION,
      filters: { text: QUESTION },
      chips: [],
      excludeReason: null,
    });
    expect(parsedOrName(QUESTION, { filters: { text: QUESTION }, chips: [] }).chips).toEqual([]);
  });

  it('a way out reruns with what it promised: a wider time, or the related word', () => {
    const state = plainReducer(initialPlain('omakase sushi in ubud'), {
      type: 'parsed',
      question: 'omakase sushi in ubud',
      filters: { text: 'omakase sushi', max_minutes: { from: 'stay', minutes: 30 } },
      chips: [{ code: 'max_minutes', params: { from: 'stay', minutes: 30 } }],
      excludeReason: null,
    });
    const widen = filtersFor(state.filters, {
      kind: 'widen',
      params: { minutes: 90 },
      count: 3,
      areas: ['Seminyak'],
      openLate: null,
    });
    expect(widen?.max_minutes).toEqual({ from: 'stay', minutes: 90 });
    const widened = plainReducer(state, { type: 'relax', filters: widen ?? state.filters });
    expect(widened.chips).toEqual([{ code: 'max_minutes', params: { from: 'stay', minutes: 90 } }]);
    expect([widened.search, widened.round]).toEqual(['loading', state.round + 1]);
    const related = filtersFor(state.filters, {
      kind: 'related',
      params: { term: 'japanese' },
      count: 4,
      areas: ['Ubud'],
      openLate: 2,
    });
    expect(related).toMatchObject({ text: 'japanese', max_minutes: { minutes: 30 } });
    expect(
      filtersFor(state.filters, { kind: 'pin', params: {}, count: 0, areas: [], openLate: null }),
    ).toBeNull();
  });
});

describe('an answer with nothing that matches everything', () => {
  const place = { id: '0199a3f0-0000-7000-8000-000000000021', name: 'Warung Pantai' };

  it('keeps the places a looser search found and what it left out', () => {
    const read = readPlainAnswer({
      results: [],
      soft_misses: [],
      close: { results: [place, { name: 'no id' }], dropped: ['open_past', 7] },
    });
    expect(read.places).toEqual([]);
    expect(read.close?.places.map((entry) => entry.name)).toEqual(['Warung Pantai']);
    expect(read.close?.dropped).toEqual(['open_past']);
  });

  it('has no close places from an older server or an empty looser search', () => {
    expect(readPlainAnswer({ results: [] }).close).toBeNull();
    expect(readPlainAnswer({ results: [], close: { results: [], dropped: [] } }).close).toBeNull();
  });

  it('sends the question as typed beside the filters, and retries a failed search', () => {
    const state = parsed();
    const query = plainSearchQuery(state.filters, { tripId: 't', destinationId: 'd' }, QUESTION);
    expect(new URLSearchParams(query.split('?')[1]).get('words')).toBe(QUESTION);
    const failed = plainReducer(state, { type: 'failed', round: state.round, offline: false });
    expect(failed.search).toBe('failed');
    const again = plainReducer(failed, { type: 'retry' });
    expect(again.search).toBe('loading');
    expect(again.round).toBe(failed.round + 1);
  });
});

describe('a chip that leaves out days', () => {
  const day = (n: number, weekday: string) => ({
    id: `0199a3f0-0000-7000-8000-00000000da0${String(n)}`,
    dayNo: n,
    date: null,
    weekday,
  });
  const days = [day(1, 'Mon'), day(2, 'Tue'), day(3, 'Wed'), day(4, 'Thu')];
  const ids = (...nos: number[]) => nos.map((n) => days[n - 1]?.id ?? '');

  it('names the one day left when every other day is left out', () => {
    expect(onlyDayLeft(ids(2, 3, 4), days)).toBe('Mon');
  });

  it('stays a "not" when one day is left out or several are left', () => {
    expect(onlyDayLeft(ids(3), days)).toBeNull();
    expect(onlyDayLeft(ids(1, 2), days)).toBeNull();
    expect(onlyDayLeft(ids(1), days.slice(0, 2))).toBeNull();
  });
});
