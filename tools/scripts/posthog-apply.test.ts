import { describe, expect, it } from 'vitest';

import { applyPosthog, loadPosthogConfig, type Http } from './posthog-apply';

/** PostHog's REST API at the network boundary: paginated lists and created ids, like the API. */
function fakePosthog() {
  const calls: string[] = [];
  const rows = {
    dashboards: [] as { id: number; name: string }[],
    insights: [] as { id: number; name: string }[],
  };
  let nextId = 1;
  const http: Http = (method, path, body) => {
    calls.push(`${method} ${path.split('?')[0] ?? path}`);
    const kind = path.includes('/dashboards/') ? 'dashboards' : 'insights';
    if (method === 'GET') return Promise.resolve({ results: rows[kind], next: null });
    if (method === 'POST') {
      const row = { id: nextId++, name: String((body as { name: string }).name) };
      rows[kind].push(row);
      return Promise.resolve(row);
    }
    return Promise.resolve({});
  };
  return { http, calls, rows };
}

describe('posthog config', () => {
  it('uses only catalog events and properties', () => {
    const config = loadPosthogConfig();
    expect(config.insights.map((insight) => insight.key)).toEqual(
      expect.arrayContaining([
        'acquisition-funnel',
        'invite-time-to-issue',
        'ai-cost-per-trip',
        'monetise-funnel',
      ]),
    );
  });
});

describe('posthog apply', () => {
  it('discards IPs and creates dashboards and insights once', async () => {
    const config = loadPosthogConfig();
    const posthog = fakePosthog();
    const first = await applyPosthog(config, posthog.http, '42');
    expect(posthog.calls[0]).toBe('PATCH /api/projects/42/');
    expect(first.filter((line) => line.startsWith('created insight'))).toHaveLength(
      config.insights.length,
    );

    const second = await applyPosthog(config, posthog.http, '42');
    expect(second).toEqual([]);
    expect(posthog.rows.insights).toHaveLength(config.insights.length);
    expect(posthog.rows.dashboards).toHaveLength(config.dashboards.length);
  });
});
