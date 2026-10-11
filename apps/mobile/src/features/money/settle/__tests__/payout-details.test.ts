import { describe, expect, it } from '@jest/globals';

import { validDetails } from '../payout-details';

describe('payout details before a save', () => {
  it('fills the proxy type for phone-number kinds and drops blank fields', () => {
    expect(validDetails('paynow', { proxy: '+6591234567', name: ' Wei ' })).toEqual({
      proxy: '+6591234567',
      name: 'Wei',
      proxy_type: 'mobile',
    });
    expect(
      validDetails('bank', {
        bank_name: 'DBS',
        account_name: 'Wei',
        account_number: '1',
        swift: '',
      }),
    ).toEqual({ bank_name: 'DBS', account_name: 'Wei', account_number: '1' });
  });

  it('holds back details the server would refuse', () => {
    expect(validDetails('vietqr', { bank_bin: '12', account_number: '1234' })).toBeNull();
    expect(validDetails('wise_link', { url: 'https://example.com/pay' })).toBeNull();
    expect(validDetails('cash', {})).toEqual({});
  });
});
