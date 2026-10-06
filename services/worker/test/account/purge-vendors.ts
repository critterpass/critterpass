/**
 * The three stores the external purge talks to, doubled at the network boundary with response
 * bodies in each vendor's documented shape (test/fixtures/account-purge). Each double remembers
 * what was deleted, so a second purge reads the "nothing here" answer the real store would give.
 */
import { readFileSync } from 'node:fs';

import {
  externalPurgeSteps,
  type ExternalPurgeStep,
  type ExternalPurgeStores,
} from '../../src/jobs/account/purge-external';
import { createObjectStore } from '../../src/jobs/ops/object-store';

export const PURGE_UID = '0192a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6b';
export const PID_SALT = 'test-analytics-pid-salt';

const fixture = (name: string) =>
  readFileSync(new URL(`../fixtures/account-purge/${name}`, import.meta.url), 'utf8');

const LANGFUSE = 'https://langfuse.test';
const POSTHOG = 'https://posthog.test';

export interface VendorDouble {
  /** `METHOD host/path?query` of every request, in order. */
  readonly calls: string[];
  /**
   * Hosts that refuse every request (403) until removed. A refusal rather than a 5xx: the bucket
   * client retries those itself for most of a minute.
   */
  readonly refusing: Set<string>;
  readonly fetch: typeof fetch;
  stores(overrides?: { analyticsAdmin?: boolean }): ExternalPurgeStores;
  steps(overrides?: { analyticsAdmin?: boolean }): readonly ExternalPurgeStep[];
}

export function vendorDouble(): VendorDouble {
  const calls: string[] = [];
  const refusing = new Set<string>();
  const gone = { uploads: 0, exports: 0, traces: false, person: false };
  const xml = (body: string) =>
    new Response(body, { headers: { 'content-type': 'application/xml' } });
  const json = (body: string, status = 200) =>
    new Response(body, { status, headers: { 'content-type': 'application/json' } });

  const answer: typeof fetch = (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    const method = request.method;
    calls.push(`${method} ${url.host}${url.pathname}${url.search}`);
    if (refusing.has(url.host)) return Promise.resolve(new Response('forbidden', { status: 403 }));

    if (url.host === 'r2.test') {
      const prefix = url.searchParams.get('prefix');
      if (method === 'GET' && prefix?.startsWith('u/')) {
        return Promise.resolve(
          xml(fixture(gone.uploads >= 2 ? 'r2-list-empty.xml' : 'r2-list-uploads.xml')),
        );
      }
      if (method === 'GET' && prefix?.startsWith('exports/')) {
        return Promise.resolve(
          xml(fixture(gone.exports >= 1 ? 'r2-list-empty.xml' : 'r2-list-exports.xml')),
        );
      }
      if (method === 'DELETE') {
        if (url.pathname.startsWith('/media/exports/')) gone.exports += 1;
        else gone.uploads += 1;
        return Promise.resolve(new Response(null, { status: 204 }));
      }
    }
    if (url.host === 'langfuse.test' && url.pathname === '/api/public/traces') {
      if (method === 'GET') {
        return Promise.resolve(
          json(fixture(gone.traces ? 'langfuse-traces-empty.json' : 'langfuse-traces.json')),
        );
      }
      if (method === 'DELETE') {
        gone.traces = true;
        return Promise.resolve(json(fixture('langfuse-delete.json')));
      }
    }
    if (url.host === 'posthog.test') {
      if (method === 'GET') {
        return Promise.resolve(
          json(fixture(gone.person ? 'posthog-persons-empty.json' : 'posthog-persons.json')),
        );
      }
      if (method === 'DELETE') {
        gone.person = true;
        return Promise.resolve(new Response(null, { status: 202 }));
      }
    }
    return Promise.resolve(new Response('unexpected request', { status: 500 }));
  };

  return {
    calls,
    refusing,
    fetch: answer,
    stores(overrides = {}) {
      return {
        // The bucket client signs with aws4fetch, which calls the global fetch (stubbed by the suite).
        media: createObjectStore({
          endpoint: 'https://r2.test',
          bucket: 'media',
          accessKeyId: 'test-access-key',
          secretAccessKey: 'test-secret-key',
        }),
        analytics: {
          collecting: true,
          admin:
            overrides.analyticsAdmin === false
              ? null
              : { apiKey: 'phx_test', projectId: '42', host: POSTHOG, fetch: answer },
          pidSalt: PID_SALT,
        },
        traces: { publicKey: 'pk-lf-test', secretKey: 'sk-lf-test', host: LANGFUSE, fetch: answer },
      };
    },
    steps(overrides = {}) {
      return externalPurgeSteps(this.stores(overrides));
    },
  };
}
