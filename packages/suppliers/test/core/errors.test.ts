/**
 * Supplier failures in the wire vocabulary: a call hung past the 120 s cap answers
 * `UPSTREAM_TIMEOUT` (and not a moment earlier), an upstream outage `SUPPLIER_UNAVAILABLE`, a
 * business refusal `SUPPLIER_REJECTED`, and a switched-off partner never reaches the network.
 */
import { DomainError } from '@cp/domain';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SUPPLIER_TIMEOUT_CAP_MS } from '../../src/core/egress';
import { toSupplierDomainError } from '../../src/core/errors';
import { requirePartnerEnabled, type FlagQuery } from '../../src/core/flags';
import { createSupplierHttp, SupplierHttpError } from '../../src/core/http';

const hang = (_input: string | URL, init?: RequestInit) =>
  new Promise<Response>((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
  });

afterEach(() => {
  vi.useRealTimers();
});

describe('supplier timeouts', () => {
  it('answers UPSTREAM_TIMEOUT at the 120 s cap, not before', async () => {
    vi.useFakeTimers();
    const http = createSupplierHttp({ fetch: hang, audit: () => Promise.resolve() });
    const outcome = http
      .request({
        supplier: 'viator',
        endpoint: 'cart_book',
        url: 'https://supplier.test/book',
        method: 'POST',
        body: '{}',
        // Asked for longer than the cap: the cap wins.
        timeoutMs: 10 * 60_000,
      })
      .then(
        () => 'answered',
        (error: unknown) => toSupplierDomainError(error, 'viator'),
      );
    let settled = false;
    void outcome.then(() => (settled = true));

    await vi.advanceTimersByTimeAsync(SUPPLIER_TIMEOUT_CAP_MS - 1);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const error = await outcome;
    expect(error).toBeInstanceOf(DomainError);
    expect(error).toMatchObject({ code: 'UPSTREAM_TIMEOUT', http: 504, retryable: true });
  });
});

describe('supplier error mapping', () => {
  it('maps an outage to SUPPLIER_UNAVAILABLE and a refusal to SUPPLIER_REJECTED', () => {
    const down = new SupplierHttpError('down', 'viator', 503, true);
    expect(toSupplierDomainError(down, 'viator').code).toBe('SUPPLIER_UNAVAILABLE');
    const refused = new SupplierHttpError('bad', 'viator', 400, false);
    expect(toSupplierDomainError(refused, 'viator')).toMatchObject({
      code: 'SUPPLIER_REJECTED',
      detail: { supplier: 'viator', supplier_code: 'http_400' },
    });
  });

  it('treats a refused key as our configuration: link fallback, not a rejection', () => {
    const key = new SupplierHttpError('key', 'viator', 401, false);
    expect(toSupplierDomainError(key, 'viator')).toMatchObject({
      code: 'SUPPLIER_UNAVAILABLE',
      detail: { reason: 'credentials' },
    });
  });
});

describe('partner flag guard', () => {
  const flags = (enabled: boolean | undefined): FlagQuery => {
    return () => Promise.resolve({ rows: enabled === undefined ? [] : [{ enabled }] });
  };

  it('lets a switched-on partner through', async () => {
    await expect(requirePartnerEnabled(flags(true), 'viator_booking')).resolves.toBeUndefined();
  });

  it('answers SUPPLIER_UNAVAILABLE for a switched-off or unknown partner', async () => {
    await expect(requirePartnerEnabled(flags(false), 'viator_booking')).rejects.toMatchObject({
      code: 'SUPPLIER_UNAVAILABLE',
      detail: { reason: 'flag_off' },
    });
    await expect(requirePartnerEnabled(flags(undefined), 'gyg_api')).rejects.toMatchObject({
      code: 'SUPPLIER_UNAVAILABLE',
    });
  });
});
