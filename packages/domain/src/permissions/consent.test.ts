import { describe, expect, it } from 'vitest';

import { setConsentPayloadSchema } from './consent';

describe('set_consent payload', () => {
  it('accepts the Help share consent the Help hub asks for', () => {
    expect(
      setConsentPayloadSchema.safeParse({
        purpose: 'help_auto_share',
        granted: true,
        copy_version: 'help-share-1',
      }).success,
    ).toBe(true);
  });

  it('still refuses a purpose the app never asks for itself', () => {
    expect(setConsentPayloadSchema.safeParse({ purpose: 'faces', granted: true }).success).toBe(
      false,
    );
  });
});
