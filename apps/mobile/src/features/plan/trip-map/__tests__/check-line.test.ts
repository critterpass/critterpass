/**
 * The peek sheet's check line names the date to fix things by only while the trip is still ahead:
 * on its first day and after, there is no "before".
 */
import { beforeAll, describe, expect, it } from '@jest/globals';
import { i18n } from '@lingui/core';

import { peekCheckLine } from '../sheet-copy';

beforeAll(() => {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
});

const check = { fixes: 1, know: 0, done: true };

describe('the check line and the trip’s start', () => {
  it('names the date while the trip is ahead', () => {
    expect(peekCheckLine(check, 'en-US', '2026-10-05', '2026-10-04')).toMatch(/before/u);
  });

  it('drops the date on the first day, during the trip and without a date', () => {
    for (const today of ['2026-10-05', '2026-10-06', '2026-11-01']) {
      expect(peekCheckLine(check, 'en-US', '2026-10-05', today)).not.toMatch(/before/u);
    }
    expect(peekCheckLine(check, 'en-US', null, '2026-10-01')).not.toMatch(/before/u);
  });
});
