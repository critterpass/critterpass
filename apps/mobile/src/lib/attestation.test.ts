import { describe, expect, it, jest } from '@jest/globals';

import {
  createAttestor,
  type AttestationKeyStore,
  type AttestationNativeModule,
  type AttestorDeps,
} from './attestation';

const INSTALL_ID = '0192f7a0-0000-7000-8000-000000000001';

function nativeError(code: string): Error {
  return Object.assign(new Error(code), { code });
}

/**
 * The fake native boundary plus its mock functions as standalone bindings (asserting on
 * `mocks.generateKeyAsync` rather than `native.generateKeyAsync` keeps
 * @typescript-eslint/unbound-method quiet).
 */
function fakeNative(isSupported: boolean | undefined = true) {
  const mocks = {
    generateKeyAsync: jest
      .fn<AttestationNativeModule['generateKeyAsync']>()
      .mockResolvedValue('key-1'),
    attestKeyAsync: jest
      .fn<AttestationNativeModule['attestKeyAsync']>()
      .mockResolvedValue('attestation-object'),
    generateAssertionAsync: jest
      .fn<AttestationNativeModule['generateAssertionAsync']>()
      .mockResolvedValue('assertion'),
    prepareIntegrityTokenProviderAsync: jest
      .fn<AttestationNativeModule['prepareIntegrityTokenProviderAsync']>()
      .mockResolvedValue(undefined),
    requestIntegrityCheckAsync: jest
      .fn<AttestationNativeModule['requestIntegrityCheckAsync']>()
      .mockResolvedValue('integrity-token'),
  };
  const native: AttestationNativeModule = { isSupported, ...mocks };
  return { native, mocks };
}

function memoryKeyStore(initial: string | null = null) {
  let keyId = initial;
  const store: AttestationKeyStore = {
    get: () => Promise.resolve(keyId),
    set: (value) => {
      keyId = value;
      return Promise.resolve();
    },
    clear: () => {
      keyId = null;
      return Promise.resolve();
    },
  };
  return { store, current: () => keyId };
}

function setup(platform: string, overrides: Partial<AttestorDeps> = {}, supported = true) {
  const { native, mocks } = fakeNative(platform === 'ios' ? supported : undefined);
  const keys = memoryKeyStore();
  let issued = 0;
  const fetchChallenge = jest.fn((installId: string) => {
    expect(installId).toBe(INSTALL_ID);
    issued += 1;
    return Promise.resolve(`challenge-${issued}`);
  });
  const attestor = createAttestor({
    platform,
    native,
    installId: () => Promise.resolve(INSTALL_ID),
    fetchChallenge,
    keyStore: keys.store,
    cloudProjectNumber: '963482787869',
    ...overrides,
  });
  return { attestor, mocks, keys, fetchChallenge };
}

describe('App Attest', () => {
  it('attests a key once per install, then asserts on every later call', async () => {
    const { attestor, mocks, keys } = setup('ios');

    const first = await attestor.attest();
    expect(first.headers).toEqual({
      'X-CP-Platform': 'ios',
      'X-CP-Install-Id': INSTALL_ID,
      'X-CP-Challenge': 'challenge-1',
      'X-CP-Attestation': 'attestation-object',
      'X-CP-Key-Id': 'key-1',
    });
    expect(mocks.attestKeyAsync).toHaveBeenCalledWith('key-1', 'challenge-1');
    await expect(first.settle({ ok: true })).resolves.toBe(false);
    expect(keys.current()).toBe('key-1');

    const second = await attestor.attest();
    const third = await attestor.attest();
    expect(second.headers['X-CP-Assertion']).toBe('assertion');
    expect(second.headers['X-CP-Attestation']).toBeUndefined();
    expect(third.headers['X-CP-Challenge']).toBe('challenge-3');
    expect(mocks.generateAssertionAsync).toHaveBeenLastCalledWith('key-1', 'challenge-3');
    expect(mocks.generateKeyAsync).toHaveBeenCalledTimes(1);
    expect(mocks.attestKeyAsync).toHaveBeenCalledTimes(1);
  });

  it('keeps no key id when the api did not accept the attestation', async () => {
    const { attestor, mocks, keys } = setup('ios');
    const first = await attestor.attest();
    await first.settle({ ok: false, errorCode: 'ATTESTATION_FAILED' });
    expect(keys.current()).toBeNull();

    await attestor.attest();
    expect(mocks.attestKeyAsync).toHaveBeenCalledTimes(2);
  });

  it('attests a fresh key when the stored one no longer exists on the device', async () => {
    const { attestor, mocks, keys } = setup('ios', { keyStore: memoryKeyStore('gone').store });
    mocks.generateAssertionAsync.mockRejectedValueOnce(
      nativeError('ERR_APP_INTEGRITY_INVALID_KEY'),
    );

    const ticket = await attestor.attest();
    expect(ticket.headers['X-CP-Attestation']).toBe('attestation-object');
    expect(ticket.headers['X-CP-Key-Id']).toBe('key-1');
    expect(keys.current()).toBeNull();
  });

  it('forgets the key and asks for a resend when the api rejects an assertion', async () => {
    const keys = memoryKeyStore('key-1');
    const { attestor } = setup('ios', { keyStore: keys.store });
    const ticket = await attestor.attest();
    expect(ticket.headers['X-CP-Assertion']).toBe('assertion');

    await expect(ticket.settle({ ok: false, errorCode: 'RATE_LIMITED' })).resolves.toBe(false);
    expect(keys.current()).toBe('key-1');
    await expect(ticket.settle({ ok: false, errorCode: 'ATTESTATION_FAILED' })).resolves.toBe(true);
    expect(keys.current()).toBeNull();
  });

  it('reports unavailable without a challenge on a device without App Attest', async () => {
    const { attestor, fetchChallenge } = setup('ios', {}, false);
    const ticket = await attestor.attest();
    expect(ticket.headers).toEqual({
      'X-CP-Platform': 'ios',
      'X-CP-Install-Id': INSTALL_ID,
      'X-CP-Attestation-Unavailable': 'unsupported',
    });
    expect(fetchChallenge).not.toHaveBeenCalled();
  });
});

describe('Play Integrity', () => {
  it('prepares the provider once per session and binds each token to a fresh challenge', async () => {
    const { attestor, mocks } = setup('android');

    const first = await attestor.attest();
    const second = await attestor.attest();

    expect(first.headers).toEqual({
      'X-CP-Platform': 'android',
      'X-CP-Install-Id': INSTALL_ID,
      'X-CP-Challenge': 'challenge-1',
      'X-CP-Integrity-Token': 'integrity-token',
    });
    expect(second.headers['X-CP-Challenge']).toBe('challenge-2');
    expect(mocks.prepareIntegrityTokenProviderAsync).toHaveBeenCalledTimes(1);
    expect(mocks.prepareIntegrityTokenProviderAsync).toHaveBeenCalledWith('963482787869');
    expect(mocks.requestIntegrityCheckAsync.mock.calls).toEqual([['challenge-1'], ['challenge-2']]);
  });

  it('degrades on a device without Play services and prepares again on the next call', async () => {
    const { attestor, mocks, fetchChallenge } = setup('android');
    mocks.prepareIntegrityTokenProviderAsync.mockRejectedValueOnce(
      nativeError('ERR_APP_INTEGRITY_PLAY_SERVICES_NOT_FOUND'),
    );

    const first = await attestor.attest();
    expect(first.headers['X-CP-Attestation-Unavailable']).toBe(
      'ERR_APP_INTEGRITY_PLAY_SERVICES_NOT_FOUND',
    );
    expect(first.headers['X-CP-Integrity-Token']).toBeUndefined();
    expect(fetchChallenge).not.toHaveBeenCalled();

    const second = await attestor.attest();
    expect(second.headers['X-CP-Integrity-Token']).toBe('integrity-token');
    expect(mocks.prepareIntegrityTokenProviderAsync).toHaveBeenCalledTimes(2);
  });

  it('prepares a new provider after Play reports the current one invalid', async () => {
    const { attestor, mocks } = setup('android');
    mocks.requestIntegrityCheckAsync.mockRejectedValueOnce(
      nativeError('ERR_APP_INTEGRITY_PROVIDER_INVALID'),
    );

    const first = await attestor.attest();
    expect(first.headers['X-CP-Attestation-Unavailable']).toBe(
      'ERR_APP_INTEGRITY_PROVIDER_INVALID',
    );
    await attestor.attest();
    expect(mocks.prepareIntegrityTokenProviderAsync).toHaveBeenCalledTimes(2);
  });

  it('reports unavailable when no cloud project number is configured', async () => {
    const { attestor, mocks } = setup('android', { cloudProjectNumber: undefined });
    const ticket = await attestor.attest();
    expect(ticket.headers['X-CP-Attestation-Unavailable']).toBe('no_cloud_project');
    expect(mocks.prepareIntegrityTokenProviderAsync).not.toHaveBeenCalled();
  });
});

describe('degrading instead of blocking', () => {
  it('gives up after the timeout and sends the request unattested', async () => {
    const { attestor, mocks } = setup('android', { timeoutMs: 20 });
    mocks.prepareIntegrityTokenProviderAsync.mockReturnValue(new Promise<void>(() => undefined));
    const ticket = await attestor.attest();
    expect(ticket.headers['X-CP-Attestation-Unavailable']).toBe('timeout');
    await expect(ticket.settle({ ok: true })).resolves.toBe(false);
  });

  it('reports a failed challenge request as unavailable', async () => {
    const { attestor } = setup('ios', {
      fetchChallenge: () => Promise.reject(nativeError('challenge_failed')),
    });
    const ticket = await attestor.attest();
    expect(ticket.headers['X-CP-Attestation-Unavailable']).toBe('challenge_failed');
  });

  it('reports an error without a code by a generic reason', async () => {
    const { attestor, mocks } = setup('ios');
    mocks.attestKeyAsync.mockRejectedValueOnce(new Error('boom'));
    const ticket = await attestor.attest();
    expect(ticket.headers['X-CP-Attestation-Unavailable']).toBe('error');
  });

  it('reports a platform without attestation', async () => {
    const { attestor } = setup('web');
    const ticket = await attestor.attest();
    expect(ticket.headers).toEqual({
      'X-CP-Platform': 'web',
      'X-CP-Install-Id': INSTALL_ID,
      'X-CP-Attestation-Unavailable': 'unsupported_platform',
    });
  });
});
