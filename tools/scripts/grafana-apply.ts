/**
 * Provisions Grafana Cloud from infra/monitoring, idempotently: dashboards (overwrite by uid),
 * the alert folder, contact points (by uid), mute timings (by name), the notification policy
 * tree, one rule group per alert file (replaced whole), and Synthetic Monitoring checks (matched
 * by job). Running it twice changes nothing the second time.
 *
 *   pnpm tsx tools/scripts/grafana-apply.ts --dry-run               # validate files only
 *   pnpm tsx tools/scripts/grafana-apply.ts --env staging           # apply
 *
 * Apply reads GRAFANA_URL, GRAFANA_TOKEN (service account), GRAFANA_PROM_DATASOURCE_UID,
 * ONCALL_EMAIL, and for uptime checks GRAFANA_SM_URL + GRAFANA_SM_TOKEN; the media probe is
 * signed with MEDIA_HMAC_KEYS / MEDIA_HMAC_ACTIVE_KID. No value is ever printed.
 */
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { signMediaUrl } from '@cp/domain';

import {
  ALERT_FOLDER_UID,
  loadMonitoring,
  toGrafanaRule,
  type MonitoringConfig,
  type Synthetics,
} from './grafana-config';

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const RUNBOOK_BASE = 'https://github.com/critterpass/critterpass/blob/main/docs/runbooks/alerts';
/** Signed probe URLs are re-signed on every apply; run apply at least monthly. */
const PROBE_TTL_SECONDS = 60 * 24 * 3600;

export type Http = (
  method: string,
  path: string,
  body?: unknown,
) => Promise<{ status: number; json: unknown }>;

export function httpClient(baseUrl: string, token: string, fetchImpl: typeof fetch = fetch): Http {
  return async (method, path, body) => {
    const response = await fetchImpl(new URL(path, baseUrl), {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    const json: unknown = text ? JSON.parse(text) : null;
    if (response.status >= 400 && response.status !== 404) {
      throw new Error(`${method} ${path} failed with HTTP ${response.status}`);
    }
    return { status: response.status, json };
  };
}

const seconds = (interval: string) =>
  Number(interval.slice(0, -1)) * { s: 1, m: 60, h: 3600 }[interval.slice(-1) as 's' | 'm' | 'h'];

export interface ApplyOptions {
  readonly config: MonitoringConfig;
  readonly grafana: Http;
  readonly datasourceUid: string;
  readonly oncallEmail: string;
}

export async function applyGrafana(options: ApplyOptions): Promise<string[]> {
  const { config, grafana } = options;
  const log: string[] = [];

  const folder = await grafana('GET', `/api/folders/${ALERT_FOLDER_UID}`);
  if (folder.status === 404) {
    await grafana('POST', '/api/folders', { uid: ALERT_FOLDER_UID, title: 'CritterPass alerts' });
    log.push(`created folder ${ALERT_FOLDER_UID}`);
  }

  for (const dashboard of config.dashboards) {
    const { id: _id, ...rest } = dashboard as Record<string, unknown>;
    await grafana('POST', '/api/dashboards/db', { dashboard: rest, overwrite: true });
    log.push(`dashboard ${dashboard.uid}`);
  }

  const existing = await grafana('GET', '/api/v1/provisioning/contact-points');
  const existingUids = new Set(
    (existing.json as { uid: string }[] | null)?.map((c) => c.uid) ?? [],
  );
  for (const point of config.policy.contactPoints) {
    const settings = JSON.parse(
      JSON.stringify(point.settings).replaceAll('${ONCALL_EMAIL}', options.oncallEmail),
    ) as Record<string, unknown>;
    const body = { ...point, settings, disableResolveMessage: false };
    if (existingUids.has(point.uid)) {
      await grafana('PUT', `/api/v1/provisioning/contact-points/${point.uid}`, body);
    } else {
      await grafana('POST', '/api/v1/provisioning/contact-points', body);
      log.push(`created contact point ${point.uid}`);
    }
  }

  for (const timing of config.policy.muteTimings) {
    const path = `/api/v1/provisioning/mute-timings/${encodeURIComponent(timing.name)}`;
    const found = await grafana('GET', path);
    if (found.status === 404) {
      await grafana('POST', '/api/v1/provisioning/mute-timings', timing);
      log.push(`created mute timing ${timing.name}`);
    } else {
      await grafana('PUT', path, timing);
    }
  }

  await grafana('PUT', '/api/v1/provisioning/policies', config.policy.policy);

  for (const file of config.ruleFiles) {
    await grafana(
      'PUT',
      `/api/v1/provisioning/folder/${ALERT_FOLDER_UID}/rule-groups/${file.group}`,
      {
        title: file.group,
        folderUid: ALERT_FOLDER_UID,
        interval: seconds(file.interval),
        rules: file.rules.map((rule) =>
          toGrafanaRule(rule, file, options.datasourceUid, RUNBOOK_BASE),
        ),
      },
    );
    log.push(`rule group ${file.group} (${file.rules.length})`);
  }
  return log;
}

interface SmCheck {
  id?: number;
  job: string;
  target: string;
}

export async function applySynthetics(
  synthetics: Synthetics,
  sm: Http,
  sign: (baseUrl: string, objectKey: string) => Promise<string>,
): Promise<string[]> {
  const probes = (await sm('GET', '/api/v1/probe/list')).json as { id: number; name: string }[];
  const probeIds = synthetics.probes.map((name) => {
    const probe = probes.find((candidate) => candidate.name === name);
    if (!probe) throw new Error(`probe ${name} is not available`);
    return probe.id;
  });
  const current = ((await sm('GET', '/api/v1/check/list')).json as SmCheck[] | null) ?? [];
  const log: string[] = [];
  for (const check of synthetics.checks) {
    const job = `${synthetics.environment}-${check.job}`;
    const target = check.signedObjectKey
      ? await sign(check.target, check.signedObjectKey)
      : check.target;
    const body = {
      job,
      target,
      enabled: true,
      frequency: synthetics.frequencyMs,
      timeout: synthetics.timeoutMs,
      probes: probeIds,
      labels: [{ name: 'env', value: synthetics.environment }],
      settings: {
        http: {
          method: 'GET',
          validStatusCodes: check.validStatusCodes,
          ipVersion: 'V4',
          noFollowRedirects: false,
        },
      },
    };
    const match = current.find((candidate) => candidate.job === job);
    if (match?.id === undefined) {
      await sm('POST', '/api/v1/check/add', body);
      log.push(`created check ${job}`);
    } else {
      await sm('POST', '/api/v1/check/update', { ...body, id: match.id });
    }
  }
  return log;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

async function signProbe(baseUrl: string, objectKey: string): Promise<string> {
  const keys = JSON.parse(required('MEDIA_HMAC_KEYS')) as Record<string, string>;
  const keyId = required('MEDIA_HMAC_ACTIVE_KID');
  const secret = keys[keyId];
  if (!secret) throw new Error('MEDIA_HMAC_ACTIVE_KID does not name a key');
  return signMediaUrl({
    baseUrl,
    objectKey,
    variant: 'original',
    expiresAt: Math.floor(Date.now() / 1000) + PROBE_TTL_SECONDS,
    keyId,
    secret,
  });
}

async function main() {
  const args = process.argv.slice(2).filter((arg, index) => !(index === 0 && arg === '--'));
  const { values } = parseArgs({
    args,
    options: { 'dry-run': { type: 'boolean', default: false }, env: { type: 'string' } },
  });
  const config = loadMonitoring(REPO_ROOT);
  const rules = config.ruleFiles.reduce((n, file) => n + file.rules.length, 0);
  console.log(
    `valid: ${config.dashboards.length} dashboards, ${rules} alert rules, ${config.synthetics.length} synthetic sets`,
  );
  if (values['dry-run']) return;

  const env = values.env;
  if (env !== 'staging' && env !== 'production')
    throw new Error('--env staging|production is required');
  const grafana = httpClient(required('GRAFANA_URL'), required('GRAFANA_TOKEN'));
  const log = await applyGrafana({
    config,
    grafana,
    datasourceUid: required('GRAFANA_PROM_DATASOURCE_UID'),
    oncallEmail: required('ONCALL_EMAIL'),
  });
  const synthetics = config.synthetics.find((set) => set.environment === env);
  if (synthetics) {
    const sm = httpClient(required('GRAFANA_SM_URL'), required('GRAFANA_SM_TOKEN'));
    log.push(...(await applySynthetics(synthetics, sm, signProbe)));
  }
  console.log(log.join('\n'));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
