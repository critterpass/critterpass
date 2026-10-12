import { describe, expect, it } from '@jest/globals';

import { inviteTextOf } from '../scan-code';

describe('reading a QR for an invite', () => {
  it('takes the first barcode holding a code or an invite link, skipping others', () => {
    expect(inviteTextOf(['https://example.com/menu', ' KQ7M3P '])).toBe('KQ7M3P');
    expect(inviteTextOf(['nothing here', 'hello'])).toBeNull();
    expect(inviteTextOf([])).toBeNull();
  });
});
