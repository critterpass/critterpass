import { describe, expect, it } from 'vitest';

import { DomainError, ERROR_CODES, type ErrorCode, errorMessageKey } from '../src/errors';

const RETRYABLE_CODES: readonly ErrorCode[] = [
  'RATE_LIMITED',
  'SUPPLIER_UNAVAILABLE',
  'UPSTREAM_TIMEOUT',
  'INTERNAL',
];

describe('ERROR_CODES', () => {
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
