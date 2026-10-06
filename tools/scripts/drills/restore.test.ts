import { describe, expect, it } from 'vitest';

import { compareCounts, comparisonFailed, newestDump } from './restore';

describe('newestDump', () => {
  it('picks the latest daily dump and ignores other objects', () => {
    const dump = newestDump([
      { key: 'postgres/2026-10-04.dump', size: 1 },
      { key: 'postgres/2026-10-05.dump', size: 2 },
      { key: 'postgres/notes.txt', size: 3 },
    ]);
    expect(dump?.key).toBe('postgres/2026-10-05.dump');
  });
});

describe('compareCounts', () => {
  const source = [
    { table: 'public.trips', rows: 1000 },
    { table: 'public.expenses', rows: 400 },
    { table: 'public.pois', rows: 50_000 },
    { table: 'ops.ops_config', rows: 0 },
  ];

  it('passes when every table is back and counts only moved by recent writes', () => {
    const restored = [
      { table: 'public.trips', rows: 990 },
      { table: 'public.expenses', rows: 400 },
      { table: 'public.pois', rows: 49_000 },
      { table: 'ops.ops_config', rows: 0 },
    ];
    const comparison = compareCounts(source, restored);
    expect(comparison).toEqual({ missing: [], extra: [], emptied: [], drift: [] });
    expect(comparisonFailed(comparison)).toBe(false);
  });

  it('fails on a missing table or a table that came back empty, and reports large drift', () => {
    const restored = [
      { table: 'public.trips', rows: 0 },
      { table: 'public.pois', rows: 30_000 },
      { table: 'ops.ops_config', rows: 0 },
    ];
    const comparison = compareCounts(source, restored);
    expect(comparison.missing).toEqual(['public.expenses']);
    expect(comparison.emptied).toEqual(['public.trips']);
    expect(comparison.drift).toEqual([{ table: 'public.pois', source: 50_000, restored: 30_000 }]);
    expect(comparisonFailed(comparison)).toBe(true);
  });
});
