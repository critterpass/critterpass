import { describe, expect, it } from '@jest/globals';

import { addSheetRows } from '../result-rows';
import type { PlaceResult, SearchState } from '../search';

function place(id: string, clash = false): PlaceResult {
  return {
    id,
    name: id,
    blurb: null,
    pill: clash ? { kind: 'clash' } : { kind: 'fits', day: null },
  };
}

const done = (results: readonly PlaceResult[], offline = false): SearchState => ({
  kind: 'done',
  results,
  offline,
});

const keepIndex = (typed: string, search: SearchState) =>
  addSheetRows(typed, search).findIndex((row) => row.kind === 'keep');

describe('the add sheet keeps the typed words where the finger is', () => {
  it('shows no rows before anything is typed', () => {
    expect(addSheetRows('', done([place('a')]))).toEqual([]);
  });

  it('never moves the keep row as results arrive after it is shown', () => {
    const typed = 'Fushimi Inari at sunrise';
    const states: SearchState[] = [
      { kind: 'loading' },
      done([]),
      done([place('sunrise')]),
      done([place('sunrise'), place('inari'), place('fushimi')]),
      done([place('inari'), place('closed', true)]),
      done([], true),
      done([place('cached')], true),
    ];
    const first = keepIndex(typed, states[0] as SearchState);
    for (const state of states) expect(keepIndex(typed, state)).toBe(first);
  });

  it('lists open places, then the closed ones under their heading, after the keep row', () => {
    const rows = addSheetRows('ramen', done([place('a'), place('shut', true), place('b')]));
    expect(rows.map((row) => (row.kind === 'place' ? row.place.id : row.kind))).toEqual([
      'keep',
      'found',
      'a',
      'b',
      'closed',
      'shut',
    ]);
  });

  it('says why nothing matched, offline or not', () => {
    expect(addSheetRows('x', done([], true))).toContainEqual({ kind: 'none', offline: true });
    expect(addSheetRows('x', done([]))).toContainEqual({ kind: 'none', offline: false });
    expect(addSheetRows('x', done([place('a')], true))).toContainEqual({ kind: 'offline' });
  });
});
