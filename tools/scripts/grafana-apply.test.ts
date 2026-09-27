import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { applyGrafana, applySynthetics, type Http } from './grafana-apply';
import { loadMonitoring } from './grafana-config';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));

/** Grafana's HTTP API at the network boundary: stores what is written, answers like the API. */
function fakeGrafana() {
  const calls: string[] = [];
  const store = new Map<string, unknown>();
  const http: Http = (method, path, body) => {
    calls.push(`${method} ${path}`);
    if (method === 'GET') {
      if (path === '/api/v1/provisioning/contact-points') {
        return Promise.resolve({
          status: 200,
          json: [...store.entries()].filter(([key]) => key.startsWith('cp:')).map(([, v]) => v),
        });
      }
      if (path === '/api/v1/probe/list') {
        return Promise.resolve({
          status: 200,
          json: [
            { id: 11, name: 'Singapore' },
            { id: 22, name: 'Frankfurt' },
            { id: 33, name: 'Tokyo' },
          ],
        });
      }
      if (path === '/api/v1/check/list') {
        return Promise.resolve({
          status: 200,
          json: [...store.entries()].filter(([key]) => key.startsWith('check:')).map(([, v]) => v),
        });
      }
      return Promise.resolve(
        store.has(path) ? { status: 200, json: store.get(path) } : { status: 404, json: null },
      );
    }
    const record = body as Record<string, unknown>;
    if (path === '/api/folders') store.set(`/api/folders/${String(record['uid'])}`, record);
    if (path === '/api/v1/provisioning/contact-points')
      store.set(`cp:${String(record['uid'])}`, record);
    if (path === '/api/v1/provisioning/mute-timings') {
      store.set(
        `/api/v1/provisioning/mute-timings/${encodeURIComponent(String(record['name']))}`,
        record,
      );
    }
    if (path === '/api/v1/check/add')
      store.set(`check:${String(record['job'])}`, { ...record, id: store.size + 1 });
    store.set(`${method} ${path}`, body);
    return Promise.resolve({ status: 200, json: {} });
  };
  return { http, calls, store };
}

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

describe('grafana apply', () => {
  it('creates on the first run and only updates on the second', async () => {
    const config = loadMonitoring(ROOT);
    const grafana = fakeGrafana();
    const options = {
      config,
      grafana: grafana.http,
      datasourceUid: 'prom',
      oncallEmail: 'oncall@example.test',
    };

    const first = await applyGrafana(options);
    expect(first).toEqual(
      expect.arrayContaining(['created folder cp-alerts', 'created contact point cp-oncall-email']),
    );
    const creates = grafana.calls.filter(
      (call) => call.startsWith('POST /api/v1/provisioning') || call === 'POST /api/folders',
    );

    grafana.calls.length = 0;
    const second = await applyGrafana(options);
    expect(second.some((line) => line.startsWith('created'))).toBe(false);
    expect(
      grafana.calls.filter(
        (call) => call.startsWith('POST /api/v1/provisioning') || call === 'POST /api/folders',
      ),
    ).toEqual([]);
    expect(creates.length).toBeGreaterThan(0);

    const group = grafana.store.get('PUT /api/v1/provisioning/folder/cp-alerts/rule-groups/p1') as {
      interval: number;
      rules: {
        uid: string;
        labels: { severity: string };
        annotations: { runbook_url?: string };
        data: { model: { expr?: string } }[];
      }[];
    };
    expect(group.interval).toBe(60);
    const apiDown = group.rules.find((rule) => rule.uid === 'cp-p1-api-down');
    expect(apiDown?.labels.severity).toBe('P1');
    expect(apiDown?.annotations.runbook_url).toMatch(/docs\/runbooks\/alerts\/api-down\.md$/u);
    const contact = grafana.store.get('cp:cp-oncall-email') as { settings: { addresses: string } };
    expect(contact.settings.addresses).toBe('oncall@example.test');
  });

  it('adds synthetic checks once, from Singapore and Frankfurt, with a signed media probe', async () => {
    const config = loadMonitoring(ROOT);
    const staging = config.synthetics.find((set) => set.environment === 'staging');
    if (!staging) throw new Error('staging synthetics missing');
    const sm = fakeGrafana();
    const sign = (base: string, key: string) => Promise.resolve(`${base}/${key}?sig=signed`);
    const first = await applySynthetics(staging, sm.http, sign);
    expect(first).toHaveLength(staging.checks.length);
    expect(await applySynthetics(staging, sm.http, sign)).toEqual([]);
    const media = sm.store.get('check:staging-media-probe') as { target: string; probes: number[] };
    expect(media.target).toMatch(/probe\/health\.txt\?sig=signed$/u);
    expect(media.probes).toEqual([11, 22]);
  });
});
