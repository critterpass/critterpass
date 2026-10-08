import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { httpClient } from './grafana-apply';
import { loadMonitoring } from './grafana-config';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

describe('monitoring config', () => {
  it('validates every dashboard, rule, policy and synthetic check in the repo', () => {
    const config = loadMonitoring(ROOT);
    expect(config.dashboards.map((d) => d.uid).sort()).toEqual([
      'cp-ai',
      'cp-commands',
      'cp-database',
      'cp-jobs',
      'cp-push',
      'cp-realtime',
      'cp-service-health',
      'cp-sync',
    ]);
    const rules = config.ruleFiles.flatMap((file) => file.rules);
    expect(rules.filter((rule) => rule.severity === 'P1').map((rule) => rule.uid)).toEqual(
      expect.arrayContaining([
        'cp-p1-api-down',
        'cp-p1-sync-lag',
        'cp-p1-dlq-growth',
        'cp-p1-sms-spend-spike',
      ]),
    );
    expect(config.synthetics.map((set) => set.environment).sort()).toEqual([
      'production',
      'staging',
    ]);
  });
});

describe('grafana http client', () => {
  const grafanaAnswering =
    (status: number, body: unknown): typeof fetch =>
    () =>
      Promise.resolve(new Response(JSON.stringify(body), { status }));

  it("names Grafana's reason when a call fails", async () => {
    const http = httpClient(
      'https://grafana.test',
      'token',
      grafanaAnswering(400, { message: 'invalid settings' }),
    );
    await expect(http('POST', '/api/v1/provisioning/contact-points', {})).rejects.toThrow(
      'POST /api/v1/provisioning/contact-points failed with HTTP 400: invalid settings',
    );
  });

  it('hands back statuses the caller handles instead of throwing', async () => {
    const http = httpClient(
      'https://grafana.test',
      'token',
      grafanaAnswering(403, { message: 'Access denied' }),
    );
    await expect(http('GET', '/api/folders/cp-alerts', undefined, [403])).resolves.toMatchObject({
      status: 403,
    });
    await expect(http('GET', '/api/folders/cp-alerts')).rejects.toThrow('HTTP 403');
  });
});
