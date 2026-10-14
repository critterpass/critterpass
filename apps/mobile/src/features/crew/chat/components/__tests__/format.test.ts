/** Message times read 24-hour unless the 12/24-hour setting says otherwise. */
import { afterEach, describe, expect, it } from '@jest/globals';

import { DEFAULT_FORMATS, setFormats } from '@/lib/i18n/formats';

import { timeOf } from '../format';

const AT = '2026-10-03T15:02:00Z';
const plain = (text: string) => text.replace(/\s/gu, ' ');

afterEach(() => setFormats(DEFAULT_FORMATS));

describe('timeOf', () => {
  it('writes 24-hour by default, in English too', () => {
    expect(timeOf(AT, 'en', 'UTC')).toBe('15:02');
    expect(timeOf(AT, 'vi', 'UTC')).toBe('15:02');
  });

  it('follows the 12-hour setting when chosen', () => {
    setFormats({ time: '12h', distance: 'km' });
    expect(plain(timeOf(AT, 'en', 'UTC'))).toBe('03:02 PM');
  });
});
