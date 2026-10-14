import { describe, expect, it } from '@jest/globals';

import { readableTitle } from '../quest-title';

describe('readableTitle', () => {
  it('sets a title written in capitals in title case, accents and all', () => {
    expect(readableTitle('SƠN TRÀ SPOTTERS')).toBe('Sơn Trà Spotters');
    expect(readableTitle('SNACK LEDGER CREW')).toBe('Snack Ledger Crew');
    expect(readableTitle('THREE-STOP  CREW')).toBe('Three-stop  Crew');
  });

  it('keeps a mixed-case title as written', () => {
    expect(readableTitle('Warung crawl')).toBe('Warung crawl');
    expect(readableTitle('Say it in Bahasa')).toBe('Say it in Bahasa');
  });

  it('keeps a title with no letters to case', () => {
    expect(readableTitle('3 × 5')).toBe('3 × 5');
  });
});
