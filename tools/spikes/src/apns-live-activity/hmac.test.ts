import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { sign, verify } from './hmac';

const TEST_KEY = { keyId: 'spike-key-1', secret: Buffer.from('spike-secret-32-bytes-minimum!!!') };

describe('sign/verify', () => {
  it('round-trips: a signature this module produces verifies against the same key', () => {
    const body = Buffer.from(
      JSON.stringify({ op_id: 'a', command: 'set_readiness', scope: 'readiness', payload: {} }),
    );
    const headers = sign('POST', '/v1/actions', body, TEST_KEY);
    expect(verify('POST', '/v1/actions', body, headers, TEST_KEY)).toEqual({ valid: true });
  });

  it('rejects a tampered body', () => {
    const body = Buffer.from(
      JSON.stringify({ op_id: 'a', command: 'set_readiness', scope: 'readiness', payload: {} }),
    );
    const headers = sign('POST', '/v1/actions', body, TEST_KEY);
    const tampered = Buffer.from(
      JSON.stringify({
        op_id: 'a',
        command: 'set_readiness',
        scope: 'readiness',
        payload: { up: 'true' },
      }),
    );
    expect(verify('POST', '/v1/actions', tampered, headers, TEST_KEY)).toEqual({
      valid: false,
      reason: 'signature mismatch',
    });
  });

  it('rejects a timestamp outside the ±300s window', () => {
    const body = Buffer.from('{}');
    const old = new Date(Date.now() - 301_000);
    const headers = sign('POST', '/v1/actions', body, TEST_KEY, old);
    const verdict = verify('POST', '/v1/actions', body, headers, TEST_KEY);
    expect(verdict.valid).toBe(false);
  });

  it('rejects a signature made with a different key', () => {
    const body = Buffer.from('{}');
    const otherKey = {
      keyId: 'spike-key-1',
      secret: Buffer.from('a-completely-different-secret!!'),
    };
    const headers = sign('POST', '/v1/actions', body, otherKey);
    expect(verify('POST', '/v1/actions', body, headers, TEST_KEY)).toEqual({
      valid: false,
      reason: 'signature mismatch',
    });
  });
});

// Fixed test vector shared with apps/mobile/targets/_shared/ActionsClient.swift via
// tools/spikes/apns-live-activity/print-test-vector-signature.swift.
const VECTOR_KEY = { keyId: 'n/a', secret: Buffer.from('spike-secret-32-bytes-minimum!!!') };
const VECTOR_BODY = Buffer.from(
  '{"op_id":"fixed-op","command":"cast_ballot","scope":"ballot","payload":{"poll_id":"p1"}}',
);
const VECTOR_TIMESTAMP = new Date(1_700_000_000 * 1000);
// Captured once from a real run of print-test-vector-signature.swift on this machine's Xcode 27
// / CryptoKit — a fixed expectation, not recomputed at test time, so this test still catches a
// regression in the TS side even when `swift` is not on PATH (CI, other machines).
const EXPECTED_SWIFT_SIGNATURE = '-dWx_JbnXO00I5PLDl60e4hCud6VMxSEpdbKJ9WZrbo';

describe('Swift/TypeScript signature parity', () => {
  it('matches the captured Swift CryptoKit output for the fixed vector', () => {
    const headers = sign('POST', '/v1/actions', VECTOR_BODY, VECTOR_KEY, VECTOR_TIMESTAMP);
    expect(headers.signature).toBe(EXPECTED_SWIFT_SIGNATURE);
  });

  const swiftScript = path.join(
    import.meta.dirname,
    '..',
    '..',
    'apns-live-activity',
    'print-test-vector-signature.swift',
  );
  const hasSwift = existsSync(swiftScript);

  it.skipIf(!hasSwift)(
    'regenerates the same signature by actually invoking swift on this machine',
    () => {
      const output = execFileSync('swift', [swiftScript], { encoding: 'utf8' }).trim();
      expect(output).toBe(EXPECTED_SWIFT_SIGNATURE);
    },
  );
});
