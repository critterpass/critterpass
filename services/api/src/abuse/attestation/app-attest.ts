/**
 * Apple App Attest verification (docs/developer.apple.com/documentation/devicecheck/validating_apps
 * _that_connect_to_your_server). The trusted root certificate is a config value, not a
 * hard-coded constant, specifically so services/api/test/fixtures/attestation/ can drive this exact
 * function with a locally generated test root instead of Apple's real one — the same verification
 * code path Apple hardware attestations use, per code-standards.md §17's network-boundary-only test
 * doubles rule. The leaf ("credCert") and intermediate certificates are told apart structurally (the
 * leaf carries OID 1.2.840.113635.100.8.2, the intermediate does not), not by matching Apple's
 * literal subject string, so the same logic works for both the real chain and a same-shaped test one.
 */
import { createHash, createVerify, X509Certificate } from 'node:crypto';

import { Certificate } from 'pkijs';
import * as cbor from 'cbor';
import * as asn1js from 'asn1js';

import { DomainError } from '@cp/domain';

const NONCE_EXTENSION_OID = '1.2.840.113635.100.8.2';
const AAGUID_DEVELOPMENT = Buffer.from('appattestdevelop').toString('hex');
const AAGUID_PRODUCTION = Buffer.concat([Buffer.from('appattest'), Buffer.alloc(7, 0)]).toString(
  'hex',
);

export type AppAttestEnvironment = 'development' | 'production';

export interface AppAttestConfig {
  readonly teamId: string;
  readonly bundleId: string;
  /** PEM-encoded trusted root; Apple's real App Attest Root CA in production, a generated test root in fixtures. */
  readonly rootCertificatePem: string;
  readonly allowDevelopmentEnvironment: boolean;
}

export interface AppAttestAttestationInput {
  readonly attestationObject: Buffer;
  readonly challenge: Buffer;
  /** Base64 key id the client claims (from `DCAppAttestService.generateKey()`); verified, not trusted. */
  readonly keyId: string;
  readonly config: AppAttestConfig;
}

export interface AppAttestAttestationResult {
  readonly keyId: string;
  readonly publicKeyPem: string;
  readonly environment: AppAttestEnvironment;
}

export interface AppAttestAssertionInput {
  readonly assertion: Buffer;
  /** The exact bytes the client hashed as `clientDataHash` before signing (here: the consumed single-use challenge). */
  readonly payload: Buffer;
  readonly publicKeyPem: string;
  readonly previousCounter: number;
  readonly config: Pick<AppAttestConfig, 'teamId' | 'bundleId'>;
}

export interface AppAttestAssertionResult {
  readonly counter: number;
}

function fail(reason: string): never {
  throw new DomainError('ATTESTATION_FAILED', { platform: 'ios', reason });
}

interface DecodedAttestation {
  readonly fmt?: string;
  readonly attStmt?: { readonly x5c?: readonly Buffer[]; readonly receipt?: Buffer };
  readonly authData?: Buffer;
}

/** A plain `Uint8Array.slice()` copy is always backed by a real (non-shared) ArrayBuffer, which is what asn1js's `BufferSource` parameter type requires. */
function toArrayBuffer(buffer: Buffer): ArrayBuffer {
  return Uint8Array.prototype.slice.call(buffer).buffer;
}

function parseCertificateExtensions(
  der: Buffer,
): readonly { extnID: string; parsedValue?: unknown }[] {
  const asn1 = asn1js.fromBER(toArrayBuffer(der));
  const certificate = new Certificate({ schema: asn1.result });
  return certificate.extensions ?? [];
}

function findNonceExtension(der: Buffer): unknown {
  return parseCertificateExtensions(der).find((ext) => ext.extnID === NONCE_EXTENSION_OID)
    ?.parsedValue;
}

function appIdHash(teamId: string, bundleId: string): Buffer {
  return createHash('sha256').update(`${teamId}.${bundleId}`).digest();
}

/** The nine checks from Apple's "Validating apps that connect to your server" guide. */
export function verifyAppAttestAttestation(
  input: AppAttestAttestationInput,
): AppAttestAttestationResult {
  let decoded: DecodedAttestation;
  try {
    const all = cbor.decodeAllSync(input.attestationObject) as DecodedAttestation[];
    if (all.length !== 1) return fail('attestation object must decode to exactly one CBOR item');
    decoded = all[0] as DecodedAttestation;
  } catch {
    return fail('attestation object is not valid CBOR');
  }

  const x5c = decoded.attStmt?.x5c;
  if (
    decoded.fmt !== 'apple-appattest' ||
    !x5c ||
    x5c.length !== 2 ||
    !decoded.attStmt?.receipt ||
    !decoded.authData
  ) {
    return fail('attestation object has the wrong shape');
  }
  const authData = decoded.authData;

  let certificates: X509Certificate[];
  try {
    certificates = x5c.map((der) => new X509Certificate(der));
  } catch {
    return fail('x5c contains an invalid certificate');
  }

  const leafIndex = x5c.findIndex((der) => findNonceExtension(der) !== undefined);
  if (leafIndex === -1) return fail('no certificate carries the nonce extension');
  const leafCert = certificates[leafIndex];
  const leafDer = x5c[leafIndex];
  const intermediateCert = certificates[1 - leafIndex];
  if (!leafCert || !leafDer || !intermediateCert) return fail('certificate chain is incomplete');

  // 1. x5c chains to the trusted root: leaf -> intermediate -> root.
  let root: X509Certificate;
  try {
    root = new X509Certificate(input.config.rootCertificatePem);
  } catch {
    throw new Error('AppAttestConfig.rootCertificatePem is not a valid PEM certificate');
  }
  if (!intermediateCert.verify(root.publicKey))
    return fail('intermediate is not signed by the trusted root');
  if (!leafCert.verify(intermediateCert.publicKey))
    return fail('leaf is not signed by the intermediate');

  // 2-3. nonce = sha256(authData || sha256(challenge)).
  const clientDataHash = createHash('sha256').update(input.challenge).digest();
  const nonce = createHash('sha256')
    .update(Buffer.concat([authData, clientDataHash]))
    .digest('hex');

  // 4. credCert's nonce extension equals the computed nonce.
  const nonceExtension = findNonceExtension(leafDer) as
    | {
        valueBlock?: {
          value?: readonly {
            valueBlock?: { value?: readonly { valueBlock?: { valueHex: ArrayBuffer } }[] };
          }[];
        };
      }
    | undefined;
  const nonceOctetString =
    nonceExtension?.valueBlock?.value?.[0]?.valueBlock?.value?.[0]?.valueBlock?.valueHex;
  const actualNonce = nonceOctetString ? Buffer.from(nonceOctetString).toString('hex') : undefined;
  if (actualNonce !== nonce) return fail('nonce does not match the challenge');

  // 5. sha256(credCert's public key) equals the client-claimed keyId.
  const publicKeyDer = leafCert.publicKey.export({ type: 'spki', format: 'der' });
  const derivedKeyId = createHash('sha256').update(publicKeyDer).digest('base64');
  if (derivedKeyId !== input.keyId) return fail('keyId does not match the certificate public key');

  // 6. authData's RP ID hash equals sha256(teamId.bundleId).
  const rpIdHash = authData.subarray(0, 32);
  if (!rpIdHash.equals(appIdHash(input.config.teamId, input.config.bundleId))) {
    return fail('app id does not match');
  }

  // 7. authData's counter is 0 on a fresh attestation.
  const counter = authData.subarray(33, 37).readUInt32BE();
  if (counter !== 0) return fail('sign counter must be 0 on a new attestation');

  // 8. authData's aaguid matches the expected environment.
  const aaguid = authData.subarray(37, 53).toString('hex');
  if (aaguid !== AAGUID_DEVELOPMENT && aaguid !== AAGUID_PRODUCTION)
    return fail('unrecognised aaguid');
  if (aaguid === AAGUID_DEVELOPMENT && !input.config.allowDevelopmentEnvironment) {
    return fail('development environment is not accepted here');
  }

  // 9. authData's credentialId equals the keyId.
  const credentialIdLength = authData.subarray(53, 55).readUInt16BE();
  const credentialId = authData.subarray(55, 55 + credentialIdLength);
  if (credentialId.toString('base64') !== input.keyId)
    return fail('credentialId does not match keyId');

  return {
    keyId: input.keyId,
    publicKeyPem: leafCert.publicKey.export({ type: 'spki', format: 'pem' }),
    environment: aaguid === AAGUID_PRODUCTION ? 'production' : 'development',
  };
}

/** Verifies one assertion (a sensitive-call signature over a single-use server challenge) against a previously-stored public key and sign counter. */
export function verifyAppAttestAssertion(input: AppAttestAssertionInput): AppAttestAssertionResult {
  let decoded: { signature?: Buffer; authenticatorData?: Buffer };
  try {
    decoded = cbor.decodeAllSync(input.assertion)[0] as typeof decoded;
  } catch {
    return fail('assertion is not valid CBOR');
  }
  const { signature, authenticatorData } = decoded;
  if (!signature || !authenticatorData) return fail('assertion has the wrong shape');

  const clientDataHash = createHash('sha256').update(input.payload).digest();
  const nonce = createHash('sha256')
    .update(Buffer.concat([authenticatorData, clientDataHash]))
    .digest();

  const verifier = createVerify('SHA256');
  verifier.update(nonce);
  if (!verifier.verify(input.publicKeyPem, signature))
    return fail('assertion signature is invalid');

  const rpIdHash = authenticatorData.subarray(0, 32);
  if (!rpIdHash.equals(appIdHash(input.config.teamId, input.config.bundleId))) {
    return fail('app id does not match');
  }

  const counter = authenticatorData.subarray(33, 37).readUInt32BE();
  if (counter <= input.previousCounter)
    return fail('sign counter did not increase (possible replay)');

  return { counter };
}
