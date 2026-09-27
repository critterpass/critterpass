import { describe, expect, it, jest } from '@jest/globals';

import {
  buildAttestationHeaders,
  UnsupportedAttestationPlatformError,
  type AttestationNativeModule,
} from './attestation';

/**
 * Returns the fake native module plus its individual mock functions as standalone bindings:
 * asserting on `mocks.generateKeyAsync` rather than `native.generateKeyAsync` sidesteps
 * @typescript-eslint/unbound-method's (correct in general, moot for a plain object literal here)
 * warning about calling a detached method.
 */
function fakeNative(overrides: Partial<AttestationNativeModule> = {}) {
  const mocks = {
    generateKeyAsync: jest
      .fn<AttestationNativeModule['generateKeyAsync']>()
      .mockResolvedValue('key-1'),
    attestKeyAsync: jest
      .fn<AttestationNativeModule['attestKeyAsync']>()
      .mockResolvedValue('attestation-object-base64'),
    generateAssertionAsync: jest
      .fn<AttestationNativeModule['generateAssertionAsync']>()
      .mockResolvedValue('assertion-base64'),
    prepareIntegrityTokenProviderAsync: jest
      .fn<AttestationNativeModule['prepareIntegrityTokenProviderAsync']>()
      .mockResolvedValue(undefined),
    requestIntegrityCheckAsync: jest
      .fn<AttestationNativeModule['requestIntegrityCheckAsync']>()
      .mockResolvedValue('integrity-token'),
  };
  const native: AttestationNativeModule = { isSupported: true, ...mocks, ...overrides };
  return { native, mocks };
}

describe('buildAttestationHeaders: ios', () => {
  it('attests a fresh key on the first call (no existingKeyId)', async () => {
    const { native, mocks } = fakeNative();
    const headers = await buildAttestationHeaders({
      platform: 'ios',
      native,
      installId: 'install-1',
      challenge: 'challenge-1',
    });
    expect(mocks.generateKeyAsync).toHaveBeenCalledTimes(1);
    expect(mocks.attestKeyAsync).toHaveBeenCalledWith('key-1', 'challenge-1');
    expect(mocks.generateAssertionAsync).not.toHaveBeenCalled();
    expect(headers).toEqual({
      'X-CP-Install-Id': 'install-1',
      'X-CP-Platform': 'ios',
      'X-CP-Challenge': 'challenge-1',
      'X-CP-Attestation': 'attestation-object-base64',
      'X-CP-Key-Id': 'key-1',
    });
  });

  it('asserts with the existing key on a later sensitive call', async () => {
    const { native, mocks } = fakeNative();
    const headers = await buildAttestationHeaders({
      platform: 'ios',
      native,
      installId: 'install-1',
      challenge: 'challenge-2',
      existingKeyId: 'key-1',
    });
    expect(mocks.generateAssertionAsync).toHaveBeenCalledWith('key-1', 'challenge-2');
    expect(mocks.generateKeyAsync).not.toHaveBeenCalled();
    expect(mocks.attestKeyAsync).not.toHaveBeenCalled();
    expect(headers).toEqual({
      'X-CP-Install-Id': 'install-1',
      'X-CP-Platform': 'ios',
      'X-CP-Challenge': 'challenge-2',
      'X-CP-Assertion': 'assertion-base64',
    });
  });
});

describe('buildAttestationHeaders: android', () => {
  it('prepares the token provider on the first call (cloudProjectNumber present)', async () => {
    const { native, mocks } = fakeNative();
    const headers = await buildAttestationHeaders({
      platform: 'android',
      native,
      installId: 'install-2',
      challenge: 'challenge-1',
      cloudProjectNumber: 12345,
    });
    expect(mocks.prepareIntegrityTokenProviderAsync).toHaveBeenCalledWith(12345);
    expect(mocks.requestIntegrityCheckAsync).toHaveBeenCalledWith('challenge-1');
    expect(headers).toEqual({
      'X-CP-Install-Id': 'install-2',
      'X-CP-Platform': 'android',
      'X-CP-Challenge': 'challenge-1',
      'X-CP-Integrity-Token': 'integrity-token',
    });
  });

  it('skips re-preparing the token provider on a later call (no cloudProjectNumber)', async () => {
    const { native, mocks } = fakeNative();
    await buildAttestationHeaders({
      platform: 'android',
      native,
      installId: 'install-2',
      challenge: 'challenge-2',
    });
    expect(mocks.prepareIntegrityTokenProviderAsync).not.toHaveBeenCalled();
  });
});

describe('buildAttestationHeaders: unsupported device or platform', () => {
  it('throws when the native module reports isSupported: false', async () => {
    const { native } = fakeNative({ isSupported: false });
    await expect(
      buildAttestationHeaders({ platform: 'ios', native, installId: 'i', challenge: 'c' }),
    ).rejects.toThrow(/not supported on this device/);
  });

  it('throws UnsupportedAttestationPlatformError for an unrecognised platform', async () => {
    const { native } = fakeNative();
    await expect(
      buildAttestationHeaders({
        // @ts-expect-error -- exercising the runtime guard against a platform value the type system already rejects.
        platform: 'web',
        native,
        installId: 'i',
        challenge: 'c',
      }),
    ).rejects.toThrow(UnsupportedAttestationPlatformError);
  });
});
