/**
 * Generates a locally-signed App Attest attestation with the *exact* shape
 * services/api/src/abuse/attestation/app-attest.ts verifies (CBOR `apple-appattest` attestation
 * object, a 2-certificate `x5c` chain to a generated test root, the nonce extension at OID
 * 1.2.840.113635.100.8.2) — a trust-boundary double per code-standards.md §17: the verifier under
 * test never knows this is not a real Apple device, because `AppAttestConfig.rootCertificatePem` is
 * this fixture's own root, not Apple's, and every other byte is built the same way a real device
 * would. No real device fixtures exist yet (App Attest cannot run in the iOS Simulator); this
 * generator exercises the identical verification code path in the meantime (founder follow-up,
 * noted in the phase report).
 */
import 'reflect-metadata';
import { createHash, KeyObject, randomBytes, sign } from 'node:crypto';

import * as asn1js from 'asn1js';
import * as cbor from 'cbor';
import * as x509 from '@peculiar/x509';

// Node's global `crypto` (available unimported since Node 19) typechecks against the same DOM
// `Crypto`/`CryptoKey` types @peculiar/x509 expects, unlike `node:crypto`'s own `webcrypto` export
// (whose types include experimental algorithm names the DOM `KeyUsage` union does not have).
const subtle = globalThis.crypto.subtle;
x509.cryptoProvider.set(globalThis.crypto);

const SIGNING_ALGORITHM = { name: 'ECDSA', hash: 'SHA-256' };
const KEY_ALGORITHM = { name: 'ECDSA', namedCurve: 'P-256' };
export const NONCE_EXTENSION_OID = '1.2.840.113635.100.8.2';
const AAGUID_DEVELOPMENT = Buffer.from('appattestdevelop');
const AAGUID_PRODUCTION = Buffer.concat([Buffer.from('appattest'), Buffer.alloc(7, 0)]);

function certLifetime(): { notBefore: Date; notAfter: Date } {
  const now = Date.now();
  return { notBefore: new Date(now - 60_000), notAfter: new Date(now + 365 * 86_400_000) };
}

function randomSerial(): string {
  return randomBytes(8).toString('hex');
}

function nonceExtensionValue(nonce: Buffer): ArrayBuffer {
  const octetString = new asn1js.OctetString({ valueHex: nonce });
  const tagged = new asn1js.Constructed({
    idBlock: { tagClass: 3, tagNumber: 1 },
    value: [octetString],
  });
  const sequence = new asn1js.Sequence({ value: [tagged] });
  return sequence.toBER(false);
}

export interface TestAppAttestRoot {
  readonly rootCertificatePem: string;
  readonly intermediateDer: Buffer;
  signLeaf(publicKey: CryptoKey, extensions: readonly x509.Extension[]): Promise<Buffer>;
}

/** One generated root + intermediate, reused across every attestation a test file builds. */
export async function generateTestRoot(): Promise<TestAppAttestRoot> {
  const rootKeys = await subtle.generateKey(KEY_ALGORITHM, true, ['sign', 'verify']);
  const intermediateKeys = await subtle.generateKey(KEY_ALGORITHM, true, ['sign', 'verify']);
  const { notBefore, notAfter } = certLifetime();

  const root = await x509.X509CertificateGenerator.createSelfSigned({
    name: 'CN=Test App Attest Root CA',
    keys: rootKeys,
    serialNumber: randomSerial(),
    notBefore,
    notAfter,
    signingAlgorithm: SIGNING_ALGORITHM,
    extensions: [new x509.BasicConstraintsExtension(true, undefined, true)],
  });

  const intermediate = await x509.X509CertificateGenerator.create({
    subject: 'CN=Test App Attest CA 1',
    issuer: root.subject,
    serialNumber: randomSerial(),
    notBefore,
    notAfter,
    signingAlgorithm: SIGNING_ALGORITHM,
    publicKey: intermediateKeys.publicKey,
    signingKey: rootKeys.privateKey,
    extensions: [new x509.BasicConstraintsExtension(true, undefined, true)],
  });

  return {
    rootCertificatePem: root.toString('pem'),
    intermediateDer: Buffer.from(intermediate.rawData),
    async signLeaf(publicKey, extensions) {
      const leaf = await x509.X509CertificateGenerator.create({
        subject: 'CN=Test Device',
        issuer: intermediate.subject,
        serialNumber: randomSerial(),
        notBefore,
        notAfter,
        signingAlgorithm: SIGNING_ALGORITHM,
        publicKey,
        signingKey: intermediateKeys.privateKey,
        extensions: [...extensions],
      });
      return Buffer.from(leaf.rawData);
    },
  };
}

export interface AppAttestFixtureInput {
  readonly root: TestAppAttestRoot;
  readonly teamId: string;
  readonly bundleId: string;
  readonly challenge: Buffer;
  readonly environment?: 'development' | 'production';
  /** Corrupts the leaf's nonce extension so a test can exercise the tampered-nonce rejection path. */
  readonly tamperNonce?: boolean;
  /** Signs the app-id hash for a different bundle id, so a test can exercise the app-id mismatch path. */
  readonly bundleIdOverride?: string;
}

export interface AppAttestFixture {
  readonly attestationObject: Buffer;
  readonly keyId: string;
  readonly deviceKeys: CryptoKeyPair;
}

/** Builds one attestation object signed by `generateTestRoot()`'s chain, for one challenge. */
export async function buildAppAttestFixture(
  input: AppAttestFixtureInput,
): Promise<AppAttestFixture> {
  const deviceKeys = await subtle.generateKey(KEY_ALGORITHM, true, ['sign', 'verify']);
  const devicePublicKeySpki = Buffer.from(await subtle.exportKey('spki', deviceKeys.publicKey));
  const credentialId = createHash('sha256').update(devicePublicKeySpki).digest();
  const keyId = credentialId.toString('base64');

  const rpIdHash = createHash('sha256')
    .update(`${input.teamId}.${input.bundleIdOverride ?? input.bundleId}`)
    .digest();
  const flags = Buffer.from([0x40]);
  const counter = Buffer.alloc(4, 0);
  const aaguid = input.environment === 'production' ? AAGUID_PRODUCTION : AAGUID_DEVELOPMENT;
  const credentialIdLength = Buffer.alloc(2);
  credentialIdLength.writeUInt16BE(credentialId.length);
  const authData = Buffer.concat([
    rpIdHash,
    flags,
    counter,
    aaguid,
    credentialIdLength,
    credentialId,
  ]);

  const clientDataHash = createHash('sha256').update(input.challenge).digest();
  const realNonce = createHash('sha256')
    .update(Buffer.concat([authData, clientDataHash]))
    .digest();
  const nonceForExtension = input.tamperNonce
    ? createHash('sha256').update('tampered-nonce-fixture').digest()
    : realNonce;

  const leafDer = await input.root.signLeaf(deviceKeys.publicKey, [
    new x509.Extension(NONCE_EXTENSION_OID, false, nonceExtensionValue(nonceForExtension)),
  ]);

  // encodeAsync, not encode: cbor's synchronous encode collects its output through a stream pipe
  // that Node 26 no longer flushes synchronously, so it returns only the first byte there.
  const attestationObject = await cbor.encodeAsync({
    fmt: 'apple-appattest',
    attStmt: {
      x5c: [leafDer, input.root.intermediateDer],
      receipt: Buffer.from('test-receipt'),
    },
    authData,
  });

  return { attestationObject, keyId, deviceKeys };
}

export interface AppAttestAssertionFixtureInput {
  readonly deviceKeys: CryptoKeyPair;
  readonly teamId: string;
  readonly bundleId: string;
  readonly payload: Buffer;
  readonly counter: number;
}

/** Builds one assertion (a sensitive-call signature) for an already-attested device key. */
export async function buildAppAttestAssertionFixture(
  input: AppAttestAssertionFixtureInput,
): Promise<Buffer> {
  const rpIdHash = createHash('sha256').update(`${input.teamId}.${input.bundleId}`).digest();
  const flags = Buffer.from([0x40]);
  const counterBytes = Buffer.alloc(4);
  counterBytes.writeUInt32BE(input.counter);
  const authenticatorData = Buffer.concat([rpIdHash, flags, counterBytes]);

  const clientDataHash = createHash('sha256').update(input.payload).digest();
  const nonce = createHash('sha256')
    .update(Buffer.concat([authenticatorData, clientDataHash]))
    .digest();

  // App Attest assertions carry a DER-encoded ECDSA signature, which is what the verifier's
  // createVerify expects. Node encodes it canonically (minimal INTEGERs); OpenSSL rejects any other.
  const signature = sign('sha256', nonce, {
    key: KeyObject.from(input.deviceKeys.privateKey),
    dsaEncoding: 'der',
  });

  return cbor.encodeAsync({ signature, authenticatorData });
}
