import { describe, expect, it } from 'vitest';

import { DomainError, ERROR_CODES, type ErrorCode, errorMessageKey } from '../src/errors';

// Mirrors the api contracts error code table exactly; a mismatch means the table drifted from the
// contract, in either direction, and one of the two needs to change.
const DOCUMENTED_CODES: readonly ErrorCode[] = [
  'AUTH_REQUIRED',
  'SESSION_REVOKED',
  'MERGE_REQUIRED',
  'ACCOUNT_CLOSED',
  'ATTESTATION_FAILED',
  'FORBIDDEN',
  'ACTION_KEY_SCOPE',
  'NOT_FOUND',
  'VALIDATION',
  'STATE_INVALID',
  'VERSION_CONFLICT',
  'IDEMPOTENCY_MISMATCH',
  'RATE_LIMITED',
  'NUDGE_TOO_SOON',
  'QUOTA_EXHAUSTED',
  'REDRAFT_LIMIT',
  'SEAT_LIMIT',
  'WAITLISTED',
  'ENTITLEMENT_REQUIRED',
  'BOOST_INTENT_LOCKED',
  'VOTE_CLOSED',
  'NOT_ELIGIBLE',
  'INVITE_EXPIRED',
  'INVITE_REVOKED',
  'CODE_INVALID',
  'CODE_REDEEMED',
  'CODE_EXPIRED',
  'OWNED_BY_OTHER_ACCOUNT',
  'K_ANON_UNAVAILABLE',
  'HOLD_EXPIRED',
  'HOLD_NOT_PROVIDED',
  'SUPPLIER_UNAVAILABLE',
  'SUPPLIER_REJECTED',
  'PAYMENT_PENDING',
  'LOCATION_IMPLAUSIBLE',
  'CONTENT_REJECTED',
  'PAYLOAD_TOO_LARGE',
  'UPSTREAM_TIMEOUT',
  'INTERNAL',
];

const RETRYABLE_CODES: readonly ErrorCode[] = [
  'RATE_LIMITED',
  'SUPPLIER_UNAVAILABLE',
  'UPSTREAM_TIMEOUT',
  'INTERNAL',
];

describe('ERROR_CODES', () => {
  it('matches the documented error code table exactly, with no duplicates', () => {
    expect([...ERROR_CODES].sort()).toEqual([...DOCUMENTED_CODES].sort());
    expect(new Set(ERROR_CODES).size).toBe(ERROR_CODES.length);
  });

  it('gives every code an errors.<CODE> message key', () => {
    for (const code of ERROR_CODES) {
      expect(errorMessageKey(code)).toBe(`errors.${code}`);
    }
  });

  it('marks only the documented codes as retryable', () => {
    for (const code of ERROR_CODES) {
      const error = new DomainError(code);
      expect(error.retryable).toBe(RETRYABLE_CODES.includes(code));
    }
  });
});

describe('DomainError', () => {
  it('builds a wire response body with http/retryable/detail from the table', () => {
    const error = new DomainError('SEAT_LIMIT', { cap: 6, offer: null });
    expect(error.http).toBe(402);
    expect(error.retryable).toBe(false);
    expect(error.messageKey).toBe('errors.SEAT_LIMIT');
    expect(error.toResponseBody()).toEqual({
      error: {
        code: 'SEAT_LIMIT',
        message: 'SEAT_LIMIT',
        retryable: false,
        detail: { cap: 6, offer: null },
      },
    });
  });

  it('omits detail entirely when none was given', () => {
    const error = new DomainError('NOT_FOUND');
    const body = error.toResponseBody();
    expect(body).toEqual({ error: { code: 'NOT_FOUND', message: 'NOT_FOUND', retryable: false } });
    expect('detail' in body.error).toBe(false);
  });

  it('accepts a custom message for logs without changing the code contract', () => {
    const error = new DomainError('INTERNAL', { event_id: 'abc' }, 'unexpected failure');
    expect(error.message).toBe('unexpected failure');
    expect(error.code).toBe('INTERNAL');
    expect(error.retryable).toBe(true);
  });
});
