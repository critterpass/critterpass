import { describe, expect, it } from '@jest/globals';

import { readableTitle } from '../quest-title';

describe('readableTitle', () => {
  it('sets a title written in capitals in sentence case, accents and all', () => {
    expect(readableTitle('SEA OF PHRASES')).toBe('Sea of phrases');
    expect(readableTitle('THREE-STOP  CREW')).toBe('Three-stop  crew');
    expect(readableTitle('5 SNACK LEDGER')).toBe('5 Snack ledger');
  });

  it('keeps the capital on a name the quest’s own text writes with one', () => {
    const body = 'Spot five of Sơn Trà’s langurs before Đà Nẵng wakes up. Spot them early.';
    expect(readableTitle('SƠN TRÀ SPOTTERS', body)).toBe('Sơn Trà spotters');
    expect(readableTitle('SPOTTERS OF ĐÀ NẴNG', body)).toBe('Spotters of Đà Nẵng');
    expect(readableTitle('EARLY SPOT', body)).toBe('Early spot');
  });

  it('keeps a mixed-case title as written', () => {
    expect(readableTitle('Warung crawl')).toBe('Warung crawl');
    expect(readableTitle('Say it in Bahasa')).toBe('Say it in Bahasa');
  });

  it('keeps a title with no letters to case', () => {
    expect(readableTitle('3 × 5')).toBe('3 × 5');
  });
});
