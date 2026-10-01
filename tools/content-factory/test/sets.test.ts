import { describe, expect, it } from 'vitest';

import '../src/kinds/places/sets';
import { committedItems } from '../src/committed';
import { validateCommitted } from '../src/pipeline';

describe('61-place index', () => {
  it('commits all 61 places with the live guides at home', () => {
    const places = committedItems('sets');
    expect(places).toHaveLength(61);
    expect(
      places.filter((p) => p.coverage === 'live').map((p) => [p.code, p.guide, p.destination]),
    ).toEqual([
      ['vn', 'chava', 'da-nang'],
      ['mx', 'ajo', 'mexico-city'],
      ['jp', 'pon', 'kyoto'],
      ['pt', 'sardi', 'lisbon'],
      ['id', 'tokek', 'bali'],
      ['pe', 'paco', 'cusco'],
      ['is', 'lundi', 'iceland'],
    ]);
    // The index is one whole-kind batch, so only the latest committed one can ship.
    expect(validateCommitted('sets').at(-1)?.report.severity).not.toBe('fail');
  });
});
