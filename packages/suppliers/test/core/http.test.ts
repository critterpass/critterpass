/**
 * Core supplier HTTP behaviour against plain HTTP status answers (no supplier body is involved):
 * retries only idempotent reads on transient failures, one audit row per attempt, timeouts capped.
 */
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import type { SupplierCallRecord } from '../../src/core/audit';
import {
  clampTimeout,
  fetchWithEgress,
  SUPPLIER_TIMEOUT_CAP_MS,
  SupplierTimeoutError,
} from '../../src/core/egress';
import { createSupplierHttp, SupplierHttpError } from '../../src/core/http';

function scripted(statuses: readonly number[]) {
  let call = 0;
  const methods: string[] = [];
  const fetch = (_input: string | URL, init?: RequestInit) => {
    methods.push(init?.method ?? 'GET');
    const status = statuses[Math.min(call, statuses.length - 1)]!;
    call += 1;
    return Promise.resolve(new Response(status === 200 ? '{"ok":true}' : '', { status }));
  };
  return { fetch, calls: () => call, methods };
}

function client(fetch: (input: string | URL, init?: RequestInit) => Promise<Response>) {
  const audits: SupplierCallRecord[] = [];
  const http = createSupplierHttp({
    fetch,
    audit: (record) => {
      audits.push(record);
      return Promise.resolve();
    },
    sleep: () => Promise.resolve(),
  });
  return { http, audits };
}

const REQUEST = { supplier: 'test', endpoint: 'probe', url: 'https://supplier.test/probe' };

describe('supplier http retries', () => {
  it('retries a GET on 503 and 429, auditing every attempt', async () => {
    const script = scripted([503, 429, 200]);
    const { http, audits } = client(script.fetch);
    const response = await http.request(REQUEST);
    expect(response.status).toBe(200);
    expect(script.calls()).toBe(3);
    expect(audits.map((a) => [a.attempt, a.outcome, a.status])).toEqual([
      [1, 'http_error', 503],
      [2, 'http_error', 429],
      [3, 'ok', 200],
    ]);
  });

  it('never retries a write', async () => {
    const script = scripted([503, 200]);
    const { http, audits } = client(script.fetch);
    await expect(http.request({ ...REQUEST, method: 'POST', body: '{}' })).rejects.toBeInstanceOf(
      SupplierHttpError,
    );
    expect(script.calls()).toBe(1);
    expect(audits).toHaveLength(1);
  });

  it('does not retry a client error', async () => {
    const script = scripted([401, 200]);
    const { http } = client(script.fetch);
    await expect(http.request(REQUEST)).rejects.toMatchObject({ status: 401, retryable: false });
    expect(script.calls()).toBe(1);
  });

  it('gives up after the retry budget', async () => {
    const script = scripted([502]);
    const { http, audits } = client(script.fetch);
    await expect(http.request({ ...REQUEST, retries: 1 })).rejects.toMatchObject({ status: 502 });
    expect(audits).toHaveLength(2);
  });

  it('treats a body that fails the schema as a non-retryable error', async () => {
    const script = scripted([200]);
    const { http } = client(script.fetch);
    await expect(
      http.getJson(REQUEST, z.object({ data: z.array(z.number()) })),
    ).rejects.toMatchObject({ retryable: false });
    expect(script.calls()).toBe(1);
  });
});

describe('egress timeouts', () => {
  it('caps any timeout at 120 s and floors it at 1 ms', () => {
    expect(clampTimeout(10 * 60_000)).toBe(SUPPLIER_TIMEOUT_CAP_MS);
    expect(clampTimeout(0)).toBe(1);
    expect(clampTimeout(undefined)).toBe(30_000);
  });

  it('aborts a hung request at its deadline with a timeout error', async () => {
    const hang = (_input: string | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });
    await expect(
      fetchWithEgress('https://supplier.test/slow', {}, { fetch: hang, timeoutMs: 20 }),
    ).rejects.toBeInstanceOf(SupplierTimeoutError);
  });

  it('audits a timed-out attempt as a timeout and retries it', async () => {
    let calls = 0;
    const hangThenAnswer = (_input: string | URL, init?: RequestInit) => {
      calls += 1;
      if (calls > 1) return Promise.resolve(new Response('{}', { status: 200 }));
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });
    };
    const { http, audits } = client(hangThenAnswer);
    await http.request({ ...REQUEST, timeoutMs: 20 });
    expect(audits.map((a) => a.outcome)).toEqual(['timeout', 'ok']);
  });

  it('lets the caller cancel without retrying', async () => {
    const controller = new AbortController();
    const hang = (_input: string | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      });
    const { http, audits } = client(hang);
    const pending = http.request({ ...REQUEST, signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ retryable: false });
    expect(audits).toHaveLength(1);
  });
});
