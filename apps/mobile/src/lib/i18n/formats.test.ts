/** Clock times and distances in the formats chosen in Settings, and the language's own by default. */
import { afterEach, describe, expect, it } from '@jest/globals';

import {
  clockOption,
  clockText,
  currentFormats,
  DEFAULT_FORMATS,
  distanceIn,
  setFormats,
} from './formats';

const AT = new Date('2026-10-03T14:05:00Z');
const plain = (text: string) => text.replace(/[\u202f\u00a0]/gu, ' ');

afterEach(() => setFormats(DEFAULT_FORMATS));

describe('formats', () => {
  it('leaves the clock to the language until a format is chosen', () => {
    expect(clockOption()).toEqual({});
    expect(clockText('vi', AT, 'UTC')).toBe('14:05');
    expect(plain(clockText('en-US', AT, 'UTC'))).toBe('02:05 PM');
  });

  it('writes 12- or 24-hour as chosen, in any language', () => {
    setFormats({ time: '24h', distance: 'km' });
    expect(clockText('en-US', AT, 'UTC')).toBe('14:05');
    setFormats({ time: '12h', distance: 'km' });
    expect(plain(clockText('en-GB', AT, 'UTC')).toLowerCase()).toBe('02:05 pm');
    expect(currentFormats().time).toBe('12h');
  });

  it('gives distances in kilometres or miles', () => {
    expect(distanceIn(2400)).toEqual({ value: 2.4, unit: 'km' });
    setFormats({ time: null, distance: 'mi' });
    const away = distanceIn(1609.344 * 1.5);
    expect(away.unit).toBe('mi');
    expect(away.value).toBeCloseTo(1.5);
  });
});
