import type { AttestationConfig } from '../../src/abuse/attestation';

/**
 * `log` mode for both platforms and no Android credentials: attestation always runs (and always
 * logs rather than blocks) without ever needing a real cert chain. Shared by every db test suite
 * that is not itself testing attestation (core, jwks, otp, rate-limits) so a sign-in call with no
 * attestation headers at all never fails.
 */
export function disabledAttestationConfig(): AttestationConfig {
  return {
    iosMode: 'log',
    androidMode: 'log',
    appAttest: {
      teamId: 'UNUSEDTEAMID',
      bundleId: 'app.critterpass.test',
      rootCertificatePem: 'unused: this suite never sends an ios attestation header',
      allowDevelopmentEnvironment: true,
    },
    android: undefined,
  };
}
