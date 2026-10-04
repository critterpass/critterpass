/**
 * Place facts are shaped for the tiles before anyone sees them: no value without a source, a tile
 * value within twelve characters, a longer one kept as a KNOW BEFORE line, nothing written to the
 * overlay that its own schema refuses, and no Đà Nẵng run before the protected date.
 */
import type { CitedFact } from '@cp/ai';
import { describe, expect, it } from 'vitest';

import {
  editorialFacts,
  FACT_LABEL_MAX,
  isProtected,
  renderFactsReview,
  shapeFacts,
} from '../../src/kinds/places/facts';

const at = (value: string, sourceUrl = 'https://example.org/page'): CitedFact => ({
  value,
  sourceUrl,
  fetchedAt: '2026-10-04T00:00:00Z',
});
const place = {
  id: '0192f000-0000-7000-8000-000000000001',
  name: 'Tirta Empul',
  destination: 'bali',
};

describe('shapeFacts', () => {
  it('keeps short sourced values as tiles', () => {
    const shaped = shapeFacts(place, {
      entry: at('Rp 75k'),
      dress: at('Sarong'),
      knowBefore: [at('Bring dry clothes')],
    });
    expect(shaped.entry?.value).toBe('Rp 75k');
    expect(shaped.dress?.value).toBe('Sarong');
    expect(shaped.know.map((k) => k.title)).toEqual(['Bring dry clothes']);
  });

  it('drops a value without a source', () => {
    const shaped = shapeFacts(place, {
      entry: at('Free', ''),
      dress: at('Sarong', 'http://insecure.example'),
      knowBefore: [at('Photos yes, drones no', '')],
    });
    expect(shaped.entry).toBeNull();
    expect(shaped.dress).toBeNull();
    expect(shaped.know).toEqual([]);
    expect(shaped.dropped).toEqual(['entry: no source', 'dress: no source', 'know: no source']);
  });

  it('moves a value too long for a tile into what to know', () => {
    const long = 'Sarong and sash';
    expect(long.length).toBeGreaterThan(FACT_LABEL_MAX);
    const shaped = shapeFacts(place, { entry: null, dress: at(long), knowBefore: [] });
    expect(shaped.dress).toBeNull();
    expect(shaped.know.map((k) => k.title)).toEqual([long]);
  });
});

describe('editorialFacts', () => {
  it('writes only what the overlay accepts', () => {
    const shaped = shapeFacts(place, { entry: at('Rp 75k'), dress: null, knowBefore: [] });
    expect(editorialFacts(shaped)).toEqual({ entry_short: 'Rp 75k' });
    expect(editorialFacts({ ...shaped, entry: null, know: [] })).toEqual({});
  });
});

describe('protection and review', () => {
  it('holds Đà Nẵng until 2026-10-05 00:00 +07', () => {
    expect(isProtected('da-nang', new Date('2026-10-04T16:59:00Z'))).toBe(true);
    expect(isProtected('da-nang', new Date('2026-10-04T17:00:00Z'))).toBe(false);
    expect(isProtected('bali', new Date('2026-10-01T00:00:00Z'))).toBe(false);
  });

  it('escapes what the pages said', () => {
    const shaped = shapeFacts(place, { entry: at('<b>Free</b>'), dress: null, knowBefore: [] });
    expect(renderFactsReview([shaped], 'b1')).not.toContain('<b>Free</b>');
  });
});
