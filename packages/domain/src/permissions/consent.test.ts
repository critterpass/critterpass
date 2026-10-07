import { describe, expect, it } from 'vitest';

import { setConsentPayloadSchema, VOICE_CONSENT_COPY_VERSION } from './consent';

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

  it('accepts the voice consent asked before the guide first listens, and its withdrawal', () => {
    for (const granted of [true, false]) {
      expect(
        setConsentPayloadSchema.safeParse({
          purpose: 'ai_voice',
          granted,
          copy_version: VOICE_CONSENT_COPY_VERSION,
        }).success,
      ).toBe(true);
    }
  });

  it('still refuses a purpose the app never asks for itself', () => {
    expect(setConsentPayloadSchema.safeParse({ purpose: 'faces', granted: true }).success).toBe(
      false,
    );
  });
});
