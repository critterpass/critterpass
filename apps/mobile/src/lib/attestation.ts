/**
 * App Attest (iOS) / Play Integrity (Android) for the calls the api attests (docs/data-model.md
 * §3.1), built on `@expo/app-integrity`. Produces the exact request headers
 * services/api/src/abuse/attestation/index.ts's `extractAttestationHeaders` reads:
 * `X-CP-Install-Id`, `X-CP-Platform`, `X-CP-Challenge`, plus `X-CP-Attestation` + `X-CP-Key-Id` on
 * the first attested call per install, `X-CP-Assertion` on every later one (iOS), or
 * `X-CP-Integrity-Token` (Android). When attestation cannot run (simulator, no Play services, an
 * error, a timeout) the request still goes out with `X-CP-Attestation-Unavailable: <reason>`
 * instead: the api's per-platform mode decides, the app never blocks sign-in on it.
 *
 * The native module, key storage and challenge fetch are injected, so this file is unit-tested
 * against a fake native boundary (code-standards.md §17).
 */

export type AttestationPlatform = 'ios' | 'android';

/** The subset of `@expo/app-integrity`'s API this module calls. */
export interface AttestationNativeModule {
  /** iOS only: whether this device provides App Attest (false on the Simulator). */
  readonly isSupported?: boolean | undefined;
  generateKeyAsync(): Promise<string>;
  attestKeyAsync(keyId: string, challenge: string): Promise<string>;
  generateAssertionAsync(keyId: string, challenge: string): Promise<string>;
  prepareIntegrityTokenProviderAsync(cloudProjectNumber: string): Promise<void>;
  requestIntegrityCheckAsync(requestHash: string): Promise<string>;
}

/** Where the App Attest key id lives once the api has accepted its attestation (SecureStore on device). */
export interface AttestationKeyStore {
  get(): Promise<string | null>;
  set(keyId: string): Promise<void>;
  clear(): Promise<void>;
}

export interface AttestorDeps {
  readonly platform: string;
  readonly native: AttestationNativeModule;
  readonly installId: () => Promise<string>;
  /** `POST /v1/attest/challenge`: a single-use challenge bound to the install id. */
  readonly fetchChallenge: (installId: string) => Promise<string>;
  readonly keyStore: AttestationKeyStore;
  /** Android only: the Google Cloud project number linked to Play Integrity. */
  readonly cloudProjectNumber?: string | undefined;
  /** Upper bound for challenge + native work; past it the request goes out unattested. */
  readonly timeoutMs?: number;
}

/** What the attested request's response said about the attestation it carried. */
export interface AttestedResponse {
  readonly ok: boolean;
  /** The wire error code (`{error: {code}}`) of a failed response, when it has one. */
  readonly errorCode?: string | undefined;
}

export interface AttestationTicket {
  readonly headers: Readonly<Record<string, string>>;
  /** Records the outcome; `true` asks the caller to resend once with a fresh ticket. */
  settle(response: AttestedResponse): Promise<boolean>;
}

export interface Attestor {
  attest(): Promise<AttestationTicket>;
}

export const DEFAULT_ATTESTATION_TIMEOUT_MS = 5_000;
const UNAVAILABLE_HEADER = 'X-CP-Attestation-Unavailable';
const INVALID_KEY_CODE = 'ERR_APP_INTEGRITY_INVALID_KEY';
const PROVIDER_INVALID_CODE = 'ERR_APP_INTEGRITY_PROVIDER_INVALID';

class AttestationUnavailable extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = 'AttestationUnavailable';
  }
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  const code = error.code;
  return typeof code === 'string' ? code : undefined;
}

/** A short, header-safe reason: the native error code when there is one. */
function unavailableReason(error: unknown): string {
  if (error instanceof AttestationUnavailable) return error.reason;
  const code = errorCode(error);
  return code !== undefined ? code.replace(/[^A-Za-z0-9_]/g, '').slice(0, 64) : 'error';
}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new AttestationUnavailable('timeout')), ms);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

const settleNothing = () => Promise.resolve(false);

export function createAttestor(deps: AttestorDeps): Attestor {
  const timeoutMs = deps.timeoutMs ?? DEFAULT_ATTESTATION_TIMEOUT_MS;
  // One Play Integrity provider per app session; a failed prepare is retried on the next call.
  let prepared: Promise<void> | null = null;

  function prepareOnce(): Promise<void> {
    if (!deps.cloudProjectNumber) throw new AttestationUnavailable('no_cloud_project');
    prepared ??= deps.native
      .prepareIntegrityTokenProviderAsync(deps.cloudProjectNumber)
      .catch((error: unknown) => {
        prepared = null;
        throw error;
      });
    return prepared;
  }

  async function android(base: Record<string, string>): Promise<AttestationTicket> {
    await prepareOnce();
    const challenge = await deps.fetchChallenge(base['X-CP-Install-Id'] ?? '');
    let token: string;
    try {
      token = await deps.native.requestIntegrityCheckAsync(challenge);
    } catch (error) {
      if (errorCode(error) === PROVIDER_INVALID_CODE) prepared = null;
      throw error;
    }
    return {
      headers: { ...base, 'X-CP-Challenge': challenge, 'X-CP-Integrity-Token': token },
      settle: settleNothing,
    };
  }

  async function attestFreshKey(
    base: Record<string, string>,
    challenge: string,
  ): Promise<AttestationTicket> {
    const keyId = await deps.native.generateKeyAsync();
    const attestation = await deps.native.attestKeyAsync(keyId, challenge);
    return {
      headers: {
        ...base,
        'X-CP-Challenge': challenge,
        'X-CP-Attestation': attestation,
        'X-CP-Key-Id': keyId,
      },
      // Kept only once the api accepted it, so a lost or rejected attestation is redone next time.
      settle: async (response) => {
        if (response.ok) await deps.keyStore.set(keyId);
        return false;
      },
    };
  }

  async function ios(base: Record<string, string>): Promise<AttestationTicket> {
    if (deps.native.isSupported !== true) throw new AttestationUnavailable('unsupported');
    const challenge = await deps.fetchChallenge(base['X-CP-Install-Id'] ?? '');
    const keyId = await deps.keyStore.get();
    if (keyId === null) return attestFreshKey(base, challenge);
    let assertion: string;
    try {
      assertion = await deps.native.generateAssertionAsync(keyId, challenge);
    } catch (error) {
      // The Keychain outlives a reinstall but App Attest keys do not: attest a new one.
      if (errorCode(error) !== INVALID_KEY_CODE) throw error;
      await deps.keyStore.clear();
      return attestFreshKey(base, challenge);
    }
    return {
      headers: { ...base, 'X-CP-Challenge': challenge, 'X-CP-Assertion': assertion },
      // The api no longer knows this key (lost row, reset environment): forget it and resend.
      settle: async (response) => {
        if (response.ok || response.errorCode !== 'ATTESTATION_FAILED') return false;
        await deps.keyStore.clear();
        return true;
      },
    };
  }

  return {
    async attest() {
      const base: Record<string, string> = { 'X-CP-Platform': deps.platform };
      try {
        base['X-CP-Install-Id'] = await deps.installId();
        const work =
          deps.platform === 'ios'
            ? ios(base)
            : deps.platform === 'android'
              ? android(base)
              : Promise.reject(new AttestationUnavailable('unsupported_platform'));
        return await withTimeout(work, timeoutMs);
      } catch (error) {
        return {
          headers: { ...base, [UNAVAILABLE_HEADER]: unavailableReason(error) },
          settle: settleNothing,
        };
      }
    },
  };
}
