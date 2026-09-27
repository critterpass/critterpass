import { describe, expect, it } from 'vitest';

import { findSecrets } from './scan-bundle';

describe('bundle secret scan', () => {
  it('flags secret-shaped strings and passes ordinary bundle text', () => {
    // Built at runtime so the repo never holds a key-shaped literal that secret scanners flag.
    const liveKey = ['sk', 'live', 'abcdefghijklmnop1234'].join('_');
    expect(findSecrets(`const k = "${liveKey}"`)).toEqual(['secret key (sk_)']);
    expect(findSecrets('-----BEGIN PRIVATE KEY-----')).toEqual(['PEM block']);
    expect(findSecrets('fetch("/v1/admin/cmd/ban_user"); const risk_level = 2;')).toEqual([]);
  });
});
