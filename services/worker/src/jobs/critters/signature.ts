/**
 * Checks the device-key signature over an encounter's evidence (`evidenceSigningPayload`) against
 * the key the device registered at install (`device_attestations`). iOS signs with App Attest
 * `generateAssertion`: a CBOR map `{signature, authenticatorData}` whose signature covers
 * sha256(authenticatorData ‖ sha256(payload)). The key was bound to our app id when it was
 * attested, so a valid signature by it is the device's. Android keystore keys are verified as a
 * plain ECDSA-SHA256 signature over the payload once registered; with no registered key (or no
 * signature at all) the result is `unavailable`, a soft signal, never a revoke.
 */
import { createHash, createVerify } from 'node:crypto';

import type { AttestationClaim, SignatureCheck } from '@cp/domain';
import type pg from 'pg';

/** Reads one CBOR head: major type and argument, advancing `at`. */
function head(bytes: Buffer, cursor: { at: number }): { major: number; value: number } {
  const first = bytes[cursor.at];
  if (first === undefined) throw new Error('cbor: truncated');
  cursor.at += 1;
  const major = first >> 5;
  const info = first & 0x1f;
  if (info < 24) return { major, value: info };
  const width = info === 24 ? 1 : info === 25 ? 2 : info === 26 ? 4 : 0;
  if (width === 0 || cursor.at + width > bytes.length) throw new Error('cbor: unsupported length');
  const value = bytes.readUIntBE(cursor.at, width);
  cursor.at += width;
  return { major, value };
}

/** Decodes a CBOR map of text keys to byte strings (the App Attest assertion shape). */
export function decodeAssertion(bytes: Buffer): Map<string, Buffer> {
  const cursor = { at: 0 };
  const map = head(bytes, cursor);
  if (map.major !== 5) throw new Error('cbor: not a map');
  const out = new Map<string, Buffer>();
  for (let i = 0; i < map.value; i += 1) {
    const key = head(bytes, cursor);
    if (key.major !== 3) throw new Error('cbor: key is not text');
    const name = bytes.subarray(cursor.at, cursor.at + key.value).toString('utf8');
    cursor.at += key.value;
    const value = head(bytes, cursor);
    if (value.major !== 2) throw new Error('cbor: value is not bytes');
    out.set(name, Buffer.from(bytes.subarray(cursor.at, cursor.at + value.value)));
    cursor.at += value.value;
  }
  return out;
}

function verifyAppAttest(assertion: Buffer, payload: string, publicKeyPem: string): boolean {
  const decoded = decodeAssertion(assertion);
  const signature = decoded.get('signature');
  const authenticatorData = decoded.get('authenticatorData');
  if (signature === undefined || authenticatorData === undefined) return false;
  const clientDataHash = createHash('sha256').update(payload).digest();
  const nonce = createHash('sha256')
    .update(Buffer.concat([authenticatorData, clientDataHash]))
    .digest();
  return createVerify('SHA256').update(nonce).verify(publicKeyPem, signature);
}

function verifyKeystore(signature: Buffer, payload: string, publicKeyPem: string): boolean {
  return createVerify('SHA256').update(payload).verify(publicKeyPem, signature);
}

export async function checkEvidenceSignature(
  tx: pg.PoolClient,
  claim: AttestationClaim,
  payload: string,
): Promise<SignatureCheck> {
  if (claim.status !== 'signed') return 'unavailable';
  const { rows } = await tx.query<{ public_key: string; platform: string }>(
    'SELECT public_key, platform FROM device_attestations WHERE key_id = $1',
    [claim.key_id],
  );
  const key = rows[0];
  if (key === undefined || key.public_key === '') return 'unavailable';
  const expected = claim.kind === 'app_attest' ? 'ios' : 'android';
  if (key.platform !== expected) return 'invalid';
  try {
    const signature = Buffer.from(claim.signature, 'base64');
    const ok =
      claim.kind === 'app_attest'
        ? verifyAppAttest(signature, payload, key.public_key)
        : verifyKeystore(signature, payload, key.public_key);
    return ok ? 'valid' : 'invalid';
  } catch {
    return 'invalid';
  }
}
