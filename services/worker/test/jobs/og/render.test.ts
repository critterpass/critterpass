/**
 * `og.render` against recorded web Worker answers: a drawn or cached card completes, a code that
 * stopped resolving completes as purged, and the site card standing in for an unreachable api is
 * retried. Without a web origin (local runs) nothing is requested.
 */
import { describe, expect, it } from 'vitest';

import type { JobContext } from '../../../src/boss/define-job';
import { OG_WARM_USER_AGENT, ogRenderJob, ogWebBaseUrl } from '../../../src/jobs/og/render';
import { silent } from '../../helpers/jobs-harness';

function context(): JobContext {
  return {
    job: { signal: new AbortController().signal },
    logger: silent,
  } as unknown as JobContext;
}

function web(status: number, cache?: string) {
  const asked: string[] = [];
  const fetchImpl: typeof fetch = (input, init) => {
    asked.push(
      `${input instanceof Request ? input.url : input.toString()} ${new Headers(init?.headers).get('user-agent') ?? ''}`,
    );
    const headers: Record<string, string> = cache === undefined ? {} : { 'x-og-cache': cache };
    return Promise.resolve(new Response(new Uint8Array([137, 80, 78, 71]), { status, headers }));
  };
  return { asked, fetchImpl };
}

describe('og.render', () => {
  it('asks the web Worker for the card as a preview bot', async () => {
    const { asked, fetchImpl } = web(200, 'miss');
    const job = ogRenderJob({ webBaseUrl: 'https://critterpass.app', fetch: fetchImpl });
    await expect(job.handler({ kind: 'referral', token: 'WYNST8' }, context())).resolves.toEqual({
      kind: 'referral',
      card: 'drawn',
    });
    expect(asked).toEqual([
      `https://critterpass.app/og/referral/WYNST8.png?warm=1 ${OG_WARM_USER_AGENT}`,
    ]);
    expect(OG_WARM_USER_AGENT.toLowerCase()).toContain('bot/');
  });

  it('reports a cached card and a purged one', async () => {
    const cached = ogRenderJob({ webBaseUrl: 'https://x.test', fetch: web(200, 'hit').fetchImpl });
    await expect(cached.handler({ kind: 'invite', token: 'K7M2QX' }, context())).resolves.toEqual({
      kind: 'invite',
      card: 'cached',
    });
    const gone = ogRenderJob({ webBaseUrl: 'https://x.test', fetch: web(404).fetchImpl });
    await expect(gone.handler({ kind: 'invite', token: 'K7M2QX' }, context())).resolves.toEqual({
      kind: 'invite',
      card: 'purged',
    });
  });

  it('retries while the site card stands in or the Worker fails', async () => {
    for (const [status, cache] of [
      [200, 'fallback'],
      [503, undefined],
    ] as const) {
      const job = ogRenderJob({
        webBaseUrl: 'https://x.test',
        fetch: web(status, cache).fetchImpl,
      });
      await expect(job.handler({ kind: 'invite', token: 'K7M2QX' }, context())).rejects.toThrow(
        /og card invite answered/,
      );
    }
  });

  it('requests nothing without a web origin', async () => {
    const { asked, fetchImpl } = web(200, 'miss');
    const job = ogRenderJob({ webBaseUrl: undefined, fetch: fetchImpl });
    await expect(job.handler({ kind: 'invite', token: 'K7M2QX' }, context())).resolves.toEqual({
      card: 'skipped',
    });
    expect(asked).toEqual([]);
  });

  it('uses the link host of the deployment tier unless overridden', () => {
    expect(ogWebBaseUrl('production', undefined)).toBe('https://critterpass.app');
    expect(ogWebBaseUrl('staging', undefined)).toBe('https://staging.critterpass.app');
    expect(ogWebBaseUrl('local', undefined)).toBeUndefined();
    expect(ogWebBaseUrl('local', 'http://127.0.0.1:4321/')).toBe('http://127.0.0.1:4321');
  });
});
