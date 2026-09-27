import { describe, expect, it } from 'vitest';

import '../src/kinds/places/sets';
import { committedItems } from '../src/committed';
import { validateCommitted } from '../src/pipeline';

describe('61-place index', () => {
  it('commits all 61 places with the six live guides at home', () => {
    const places = committedItems('sets');
    expect(places).toHaveLength(61);
    expect(
      places.filter((p) => p.coverage === 'live').map((p) => [p.code, p.guide, p.destination]),
    ).toEqual([
      ['mx', 'ajo', 'mexico-city'],
      ['jp', 'pon', 'kyoto'],
      ['pt', 'sardi', 'lisbon'],
      ['id', 'tokek', 'bali'],
      ['pe', 'paco', 'cusco'],
      ['is', 'lundi', 'iceland'],
    ]);
    for (const { report } of validateCommitted('sets')) expect(report.severity).not.toBe('fail');
  });
});
