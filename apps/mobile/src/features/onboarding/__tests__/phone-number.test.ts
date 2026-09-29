import { describe, expect, it } from '@jest/globals';

import { formatE164, formatNational, typedNumber } from '../phone/phone-number';

describe('phone number as you type', () => {
  it('groups digits the way the country writes them, and regroups on a country switch', () => {
    expect(typedNumber('SG', '9123 456', '9123 4567')).toEqual({
      country: 'SG',
      number: '9123 4567',
    });
    expect(formatNational('VN', '9123 4567')).toBe('912 345 67');
    expect(formatE164('SG', '91234567')).toBe('+65 9123 4567');
  });

  it('takes a pasted international number into its own country', () => {
    expect(typedNumber('SG', '', '+84 949 840 370')).toEqual({
      country: 'VN',
      number: '949 840 370',
    });
    expect(typedNumber('SG', '', '+84949840370')).toEqual({ country: 'VN', number: '949 840 370' });
  });

  it('deletes the digit before a space when only the space was deleted', () => {
    // "949 840 370" with the space after 949 deleted: the 9 before it goes too.
    expect(typedNumber('VN', '949 840 370', '949840 370')).toEqual({
      country: 'VN',
      number: '948 403 70',
    });
    // A plain backspace at the end just drops the last digit.
    expect(typedNumber('SG', '9123 4567', '9123 456')).toEqual({
      country: 'SG',
      number: '9123 456',
    });
  });
});
