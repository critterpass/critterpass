import { describe, expect, it } from '@jest/globals';

import { readAward, readRecap } from '../../data/recap-rows';
import { awardRows, ME, RECEIPT, recapRow, STATS } from '../../dev/recap-fixtures';
import { buildSummaryModel, type SummaryInput } from '../summary-model';

function input(over: Partial<SummaryInput> = {}): SummaryInput {
  return {
    loaded: true,
    viewerId: ME,
    viewerIn: true,
    trip: {
      startDate: '2026-10-02',
      endDate: '2026-10-04',
      solo: false,
      crewName: 'The Đà Nẵng Four',
      place: 'Đà Nẵng',
    },
    recap: readRecap(recapRow()),
    awards: awardRows(ME).flatMap((row) => readAward(row) ?? []),
    names: new Map(),
    forms: [],
    gotAwayName: null,
    ...over,
  };
}

describe('recap page model', () => {
  it('fills the place of a tile with nothing behind it with the next number the row has', () => {
    const recap = readRecap(
      recapRow({
        stats: { ...STATS, distance_m: 0, photos: null, superlatives: [] },
        receipt: { ...RECEIPT, expenses: 0 },
      }),
    );
    expect(buildSummaryModel(input({ recap })).tiles.map((tile) => tile.id)).toEqual([
      'days',
      'finds',
      'meals',
    ]);
  });

  it('is failed, not ready, when the stats column cannot be read', () => {
    const recap = readRecap({ ...recapRow(), stats: '{"days":"three"}' });
    expect(buildSummaryModel(input({ recap })).phase).toBe('failed');
  });

  it('keeps an opted-out award off the chips', () => {
    const awards = awardRows(ME).flatMap(
      (row) => readAward(row.kind === 'early_riser' ? { ...row, opted_out: 1 } : row) ?? [],
    );
    const chips = buildSummaryModel(input({ awards })).awards;
    expect(chips.map((chip) => chip.kind)).toEqual(['treasurer', 'best_find']);
  });

  it('keeps the money tile and the crew name off a solo trip', () => {
    const recap = readRecap(recapRow({ stats: { ...STATS, travellers: 1 } }));
    const model = buildSummaryModel(input({ recap }));
    expect(model.solo).toBe(true);
    expect(model.crewName).toBeNull();
    expect(model.tiles.map((tile) => tile.id)).not.toContain('owed');
  });

  it('marks a viewer who sat the trip out, and nobody who travelled', () => {
    expect(buildSummaryModel(input({ viewerIn: false })).dropout).toBe(true);
    expect(buildSummaryModel(input()).dropout).toBe(false);
  });

  it('badges a late re-run of the receipt as late expenses and carries what is still owed', () => {
    const recap = readRecap(
      recapRow({
        version: 2,
        changed_sections: '["receipt"]',
        receipt: { ...RECEIPT, outstanding_minor: 4_200, settled: false, settled_on: null },
      }),
    );
    const model = buildSummaryModel(input({ recap }));
    expect(model.updated).toBe('expenses');
    expect(model.tiles.find((tile) => tile.id === 'owed')).toMatchObject({
      outstandingMinor: 4_200,
      settled: false,
    });
  });
});
