/**
 * App Attest (iOS) / Play Integrity (Android) wrapper (docs/data-model.md §3.1 F-029; phase-9 T3),
 * built on `@expo/app-integrity` (Expo's first-party attestation module, SDK 58; alpha as of this
 * writing — see the phase report). Produces the exact request headers
 * services/api/src/abuse/attestation/index.ts's `extractAttestationHeaders` reads
 * (`X-CP-Install-Id`, `X-CP-Platform`, `X-CP-Challenge`, plus either `X-CP-Attestation` +
 * `X-CP-Key-Id` on first attestation or `X-CP-Assertion`/`X-CP-Integrity-Token` on a later sensitive
 * call). `platform` and `native` are both injected rather than read from `react-native`'s `Platform`
 * or the real module here, so this file's logic is unit-testable against a fake native module
 * boundary (code-standards.md §17) with no native build in this lane.
 */

export type AttestationPlatform = 'ios' | 'android';

/** The subset of `@expo/app-integrity`'s API this wrapper calls. */
export interface AttestationNativeModule {
  readonly isSupported: boolean;
  generateKeyAsync(): Promise<string>;
  attestKeyAsync(keyId: string, challenge: string): Promise<string>;
  generateAssertionAsync(keyId: string, challenge: string): Promise<string>;
  prepareIntegrityTokenProviderAsync(cloudProjectNumber: number): Promise<void>;
  requestIntegrityCheckAsync(requestHash: string): Promise<string>;
}

export interface AttestationHeaders {
  readonly 'X-CP-Install-Id': string;
  readonly 'X-CP-Platform': AttestationPlatform;
  readonly 'X-CP-Challenge': string;
  readonly 'X-CP-Attestation'?: string;
  readonly 'X-CP-Key-Id'?: string;
  readonly 'X-CP-Assertion'?: string;
  readonly 'X-CP-Integrity-Token'?: string;
}

export interface BuildAttestationHeadersInput {
  readonly platform: AttestationPlatform;
  readonly native: AttestationNativeModule;
  readonly installId: string;
  readonly challenge: string;
  /**
   * iOS only: the key id from a previous `attestKeyAsync` call. Present -> sign an assertion with
   * the already-attested key (a later sensitive call); absent -> attest a fresh key (first call per
   * install). Caching this id across launches (until reinstall) is the caller's job, not this
   * wrapper's — the same "attest once per install, assertion per sensitive call" split
   * docs/data-model.md §3.1 describes.
   */
  readonly existingKeyId?: string;
  /** Android only: required on the very first call per install to initialise the token provider. */
  readonly cloudProjectNumber?: number;
}

/** Throws when `platform` names a value neither this wrapper nor the server's attestation config understands. */
export class UnsupportedAttestationPlatformError extends Error {
  constructor(platform: string) {
    super(`attestation is not supported on platform "${platform}"`);
    this.name = 'UnsupportedAttestationPlatformError';
  }
}

async function buildIosHeaders(input: BuildAttestationHeadersInput): Promise<AttestationHeaders> {
  const base = {
    'X-CP-Install-Id': input.installId,
    'X-CP-Platform': 'ios' as const,
    'X-CP-Challenge': input.challenge,
  };
  if (input.existingKeyId) {
    const assertion = await input.native.generateAssertionAsync(
      input.existingKeyId,
      input.challenge,
    );
    return { ...base, 'X-CP-Assertion': assertion };
  }
  const keyId = await input.native.generateKeyAsync();
  const attestation = await input.native.attestKeyAsync(keyId, input.challenge);
  return { ...base, 'X-CP-Attestation': attestation, 'X-CP-Key-Id': keyId };
}

async function buildAndroidHeaders(
  input: BuildAttestationHeadersInput,
): Promise<AttestationHeaders> {
  if (input.cloudProjectNumber !== undefined) {
    await input.native.prepareIntegrityTokenProviderAsync(input.cloudProjectNumber);
  }
  const integrityToken = await input.native.requestIntegrityCheckAsync(input.challenge);
  return {
    'X-CP-Install-Id': input.installId,
    'X-CP-Platform': 'android',
    'X-CP-Challenge': input.challenge,
    'X-CP-Integrity-Token': integrityToken,
  };
}

/**
 * Builds the attestation headers for one request. `existingKeyId`/`cloudProjectNumber` come from
 * wherever the caller (apps/mobile/src/data/auth/, a later task) keeps per-install state.
 */
export async function buildAttestationHeaders(
  input: BuildAttestationHeadersInput,
): Promise<AttestationHeaders> {
  if (!input.native.isSupported) {
    throw new Error('attestation is not supported on this device');
  }
  switch (input.platform) {
    case 'ios':
      return buildIosHeaders(input);
    case 'android':
      return buildAndroidHeaders(input);
    default:
      throw new UnsupportedAttestationPlatformError(input.platform);
  }
}
