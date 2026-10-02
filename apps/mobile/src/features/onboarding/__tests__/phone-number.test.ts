import { describe, expect, it } from '@jest/globals';

import { formatE164, formatNational, toE164, typedNumber } from '../phone/phone-number';

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

  it('switches to the country of a dial code typed one key at a time', () => {
    const typeIn = (country: string, keys: string) => {
      let state = { country, number: '' };
      for (const key of keys) state = typedNumber(state.country, state.number, state.number + key);
      return state;
    };
    expect(typeIn('US', '+6591234567')).toEqual({ country: 'SG', number: '9123 4567' });
    expect(typeIn('SG', '+84949840370')).toEqual({ country: 'VN', number: '949 840 370' });
    // Before the country is known the "+" and its digits stay as typed, and nothing is sent.
    expect(typeIn('US', '+6')).toEqual({ country: 'US', number: '+6' });
    expect(toE164('US', '+65')).toBeNull();
  });
});
