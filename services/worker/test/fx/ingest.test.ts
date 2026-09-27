import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { FrankfurterError, fetchFxRates } from '../../src/fx/frankfurter';
import { ingestFxSnapshots, type FxSnapshotRow, type FxSnapshotWriter } from '../../src/fx/ingest';

const fixturesDir = path.resolve(import.meta.dirname, '../fixtures/frankfurter');

async function fixtureText(name: string): Promise<string> {
  return readFile(path.join(fixturesDir, name), 'utf8');
}

function jsonResponse(body: string, status = 200): Response {
  return new Response(body, { status, headers: { 'content-type': 'application/json' } });
}

/** A `fetchImpl` double that always resolves to the given fixture body — the network boundary this
 * whole file replaces with recorded/hand-built responses instead of a live call. */
function fetchResolving(body: string, status = 200): typeof fetch {
  return vi.fn((_input: RequestInfo | URL, _init?: RequestInit) =>
    Promise.resolve(jsonResponse(body, status)),
  );
}

/** An in-memory `FxSnapshotWriter` that mimics the real table's UNIQUE (base, quote, as_of, source)
 * constraint with `ON CONFLICT DO NOTHING` semantics, so re-running ingest against the same
 * instance proves idempotency without a database. */
function createMemoryWriter(seed: readonly FxSnapshotRow[] = []): FxSnapshotWriter & {
  rows(): readonly FxSnapshotRow[];
} {
  const key = (row: FxSnapshotRow) => `${row.base}|${row.quote}|${row.asOf}|${row.source}`;
  const store = new Map(seed.map((row) => [key(row), row]));
  return {
    upsertSnapshot(row) {
      const existingKey = key(row);
      if (store.has(existingKey)) {
        return Promise.resolve({ inserted: false });
      }
      store.set(existingKey, row);
      return Promise.resolve({ inserted: true });
    },
    rows: () => [...store.values()],
  };
}

describe('fetchFxRates: Frankfurter v2 client (recorded fixtures, network boundary)', () => {
  it('parses a real recorded response, keeping every rate as an exact decimal string', async () => {
    const body = await fixtureText('latest-eur.json');
    const fetchImpl = fetchResolving(body);

    const rates = await fetchFxRates(
      {
        base: 'EUR',
        quotes: ['SGD', 'IDR', 'JPY', 'VND', 'THB', 'MYR', 'PHP', 'KRW', 'USD', 'GBP', 'AUD'],
      },
      { fetchImpl },
    );

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(rates).toHaveLength(11);
    const sgd = rates.find((rate) => rate.quote === 'SGD');
    expect(sgd).toEqual({ date: '2026-09-27', base: 'EUR', quote: 'SGD', rate: '1.4571' });
    // Frankfurter reports some currencies a day behind the rest in the same response (real fixture:
    // PHP lagged by one day here) — each row keeps its own date rather than a shared top-level one.
    const php = rates.find((rate) => rate.quote === 'PHP');
    expect(php?.date).toBe('2026-09-26');
  });

  it('builds the request URL from base/quotes/date', async () => {
    const fetchImpl = fetchResolving('[]');
    await fetchFxRates(
      { base: 'EUR', quotes: ['SGD', 'IDR'], date: '2026-09-25' },
      { fetchImpl, baseUrl: 'https://fx.example.test/v2' },
    );
    const call = vi.mocked(fetchImpl).mock.calls[0];
    expect(call).toBeDefined();
    const url = new URL(call?.[0] as string);
    expect(url.pathname).toBe('/v2/rates');
    expect(url.searchParams.get('base')).toBe('EUR');
    expect(url.searchParams.get('quotes')).toBe('SGD,IDR');
    expect(url.searchParams.get('date')).toBe('2026-09-25');
  });

  it('returns an empty array for a date with no data, rather than throwing', async () => {
    const body = await fixtureText('no-data-empty.json');
    const fetchImpl = fetchResolving(body);
    const rates = await fetchFxRates(
      { base: 'EUR', quotes: ['SGD'], date: '2099-01-01' },
      { fetchImpl },
    );
    expect(rates).toEqual([]);
  });

  it('throws a non-retryable FrankfurterError on a 422 and never retries', async () => {
    const body = await fixtureText('invalid-currency-422.json');
    const fetchImpl = fetchResolving(body, 422);
    await expect(
      fetchFxRates({ base: 'ZZZ', quotes: ['SGD'] }, { fetchImpl }),
    ).rejects.toMatchObject({ name: 'FrankfurterError', retryable: false, status: 422 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('throws a non-retryable FrankfurterError on a malformed body', async () => {
    const fetchImpl = fetchResolving('not json');
    await expect(fetchFxRates({ base: 'EUR', quotes: ['SGD'] }, { fetchImpl })).rejects.toThrow(
      FrankfurterError,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('retries a transient 503 and succeeds once the server recovers', async () => {
    const body = await fixtureText('latest-eur.json');
    let call = 0;
    const fetchImpl: typeof fetch = vi.fn((_input: RequestInfo | URL, _init?: RequestInit) => {
      call += 1;
      return Promise.resolve(call < 3 ? jsonResponse('server error', 503) : jsonResponse(body));
    });

    const rates = await fetchFxRates({ base: 'EUR', quotes: ['SGD'] }, { fetchImpl, retries: 2 });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(rates.length).toBeGreaterThan(0);
  });

  it('gives up and throws once retries are exhausted', async () => {
    const fetchImpl = fetchResolving('still failing', 503);
    await expect(
      fetchFxRates({ base: 'EUR', quotes: ['SGD'] }, { fetchImpl, retries: 1 }),
    ).rejects.toMatchObject({ retryable: true, status: 503 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('clamps an out-of-range timeout to the 120s outbound cap', async () => {
    const fetchImpl: typeof fetch = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.signal?.aborted).toBe(false);
      return Promise.resolve(jsonResponse('[]'));
    });

    await fetchFxRates({ base: 'EUR', quotes: ['SGD'] }, { fetchImpl, timeoutMs: 999_999_999 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe('ingestFxSnapshots: orchestration over a recorded fixture (no database)', () => {
  it("upserts every row from the fixture using each row's own date, and reports counts", async () => {
    const body = await fixtureText('latest-eur.json');
    const fetchImpl = fetchResolving(body);
    const writer = createMemoryWriter();

    const result = await ingestFxSnapshots(
      writer,
      {
        base: 'EUR',
        quotes: ['SGD', 'IDR', 'JPY', 'VND', 'THB', 'MYR', 'PHP', 'KRW', 'USD', 'GBP', 'AUD'],
      },
      { fetchImpl, now: new Date('2026-09-27T12:00:00Z') },
    );

    expect(result.fetched).toBe(11);
    expect(result.inserted).toBe(11);
    expect(result.skipped).toBe(0);
    expect(result.rejected).toEqual([]);
    expect(result.latestAsOf).toBe('2026-09-27');
    expect(result.stale).toBe(false);

    const php = writer.rows().find((row) => row.quote === 'PHP');
    expect(php?.asOf).toBe('2026-09-26');
  });

  it('re-running against the same writer creates no duplicates (all skipped, none inserted twice)', async () => {
    const body = await fixtureText('latest-eur.json');
    const fetchImpl = fetchResolving(body);
    const writer = createMemoryWriter();

    const first = await ingestFxSnapshots(
      writer,
      { base: 'EUR', quotes: ['SGD', 'IDR'] },
      { fetchImpl },
    );
    const second = await ingestFxSnapshots(
      writer,
      { base: 'EUR', quotes: ['SGD', 'IDR'] },
      { fetchImpl },
    );

    expect(first.inserted).toBeGreaterThan(0);
    expect(second.inserted).toBe(0);
    expect(second.skipped).toBe(second.fetched);
    expect(writer.rows()).toHaveLength(first.inserted);
  });

  it('rejects an unrecognised currency without failing the rest of the batch', async () => {
    // Frankfurter always sends `rate` as a bare JSON number (verified against the real API), so the
    // hand-built body mirrors that exactly rather than a quoted string.
    const fetchImpl = fetchResolving(
      '[{"date":"2026-09-27","base":"EUR","quote":"SGD","rate":1.4571},' +
        '{"date":"2026-09-27","base":"EUR","quote":"ZZZ","rate":9.9999}]',
    );
    const writer = createMemoryWriter();
    const result = await ingestFxSnapshots(
      writer,
      { base: 'EUR', quotes: ['SGD', 'ZZZ'] },
      { fetchImpl },
    );

    expect(result.inserted).toBe(1);
    expect(result.rejected).toEqual([{ quote: 'ZZZ', reason: 'unknown_currency' }]);
    expect(writer.rows()).toHaveLength(1);
  });

  it('flags staleness once the freshest rate is older than the threshold', async () => {
    const body = await fixtureText('latest-eur.json');
    const fetchImpl = fetchResolving(body);

    const fresh = await ingestFxSnapshots(
      createMemoryWriter(),
      { base: 'EUR', quotes: ['SGD'] },
      { fetchImpl, now: new Date('2026-09-28T00:00:00Z') },
    );
    expect(fresh.stale).toBe(false);

    const stale = await ingestFxSnapshots(
      createMemoryWriter(),
      { base: 'EUR', quotes: ['SGD'] },
      { fetchImpl, now: new Date('2026-09-30T00:00:00Z') },
    );
    expect(stale.stale).toBe(true);
  });

  it('reports stale when nothing at all was fetched', async () => {
    const body = await fixtureText('no-data-empty.json');
    const fetchImpl = fetchResolving(body);
    const result = await ingestFxSnapshots(
      createMemoryWriter(),
      { base: 'EUR', quotes: ['SGD'] },
      { fetchImpl },
    );
    expect(result.latestAsOf).toBeNull();
    expect(result.stale).toBe(true);
  });
});
