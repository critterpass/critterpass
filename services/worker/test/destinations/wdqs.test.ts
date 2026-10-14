import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { parseSparqlBody, runQuery } from '../../src/destinations/base/wdqs';
import { candidateQuery, SITELINK_BANDS } from '../../src/destinations/base/wikidata';

// A WDQS reply cut off at its time limit: status 200, JSON stopped mid-string, Java trailer.
const truncated = readFileSync(
  new URL('./fixtures/wdqs-truncated-timeout.txt', import.meta.url),
  'utf8',
);
const complete = JSON.stringify({
  results: { bindings: [{ item: { value: 'http://www.wikidata.org/entity/Q1854' } }] },
});

function replies(bodies: string[]): { fetch: typeof fetch; calls: () => number } {
  let calls = 0;
  const fetchStub = (() => {
    const body = bodies[Math.min(calls, bodies.length - 1)] ?? '';
    calls += 1;
    return Promise.resolve(new Response(body));
  }) as typeof fetch;
  return { fetch: fetchStub, calls: () => calls };
}

describe('WDQS replies', () => {
  it('reads a truncated timeout body as no answer', () => {
    expect(() => {
      JSON.parse(truncated);
    }).toThrow(SyntaxError);
    expect(parseSparqlBody(truncated)).toBeNull();
    expect(parseSparqlBody(complete)).toHaveLength(1);
  });

  it('retries a truncated page and returns the full reply', async () => {
    const stub = replies([truncated, truncated, complete]);
    const rows = await runQuery('SELECT', 'Q515 sitelinks 10–12', {
      fetch: stub.fetch,
      retryDelayMs: 1,
    });
    expect(rows).toHaveLength(1);
    expect(stub.calls()).toBe(3);
  });

  it('gives up after three retries, naming the page', async () => {
    const stub = replies([truncated]);
    await expect(
      runQuery('SELECT', 'Q515 sitelinks 10–12', { fetch: stub.fetch, retryDelayMs: 1 }),
    ).rejects.toThrow('Wikidata query Q515 sitelinks 10–12 failed: truncated response 4 times');
    expect(stub.calls()).toBe(4);
  });

  it('pages a type by sitelink bands that cover every count once', () => {
    expect(SITELINK_BANDS[0]?.[0]).toBe(10);
    for (let i = 1; i < SITELINK_BANDS.length; i += 1) {
      expect(SITELINK_BANDS[i]?.[0]).toBe(SITELINK_BANDS[i - 1]?.[1]);
    }
    expect(SITELINK_BANDS.at(-1)?.[1]).toBeNull();
    expect(candidateQuery('Q515', [12, 15])).toContain(
      'FILTER(?sitelinks >= 12 && ?sitelinks < 15)',
    );
  });
});
