/**
 * Alert routing drill: sends one synthetic alert per P1 rule (and one P2) straight into Grafana's
 * Alertmanager with the labels the real rules carry, then reads them back to prove the routing.
 * Between 07:00 and 23:00 Singapore time a P1 must be active (delivered to on-call now); outside it
 * must be suppressed by the `outside-sgt-waking-hours` mute timing (delivered at 07:00). P2 is
 * never muted. The test alerts end after five minutes and carry `drill="true"`.
 *
 *   GRAFANA_URL=… GRAFANA_TOKEN=… pnpm tsx tools/scripts/drills/fire-test-alerts.ts --staging
 *   pnpm tsx tools/scripts/drills/fire-test-alerts.ts --dry-run     # print what would be sent
 */
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { loadMonitoring, type AlertRule } from '../grafana-config';

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const FOLDER_TITLE = 'CritterPass alerts';
const MUTE_TIMING = 'outside-sgt-waking-hours';
const TEST_MINUTES = 5;

export interface TestAlert {
  readonly labels: Readonly<Record<string, string>>;
  readonly annotations: Readonly<Record<string, string>>;
  readonly startsAt: string;
  readonly endsAt: string;
}

export type Expected = 'active' | 'suppressed';

/** The hour in Singapore (UTC+8, no daylight saving). */
export function singaporeHour(now: Date): number {
  return (now.getUTCHours() + 8) % 24;
}

/** P1 pages 07:00–23:00 SGT and waits outside it; P2 is never muted. */
export function expectedState(severity: AlertRule['severity'], now: Date): Expected {
  if (severity !== 'P1') return 'active';
  const hour = singaporeHour(now);
  return hour >= 7 && hour < 23 ? 'active' : 'suppressed';
}

export function buildTestAlerts(rules: readonly AlertRule[], env: string, now: Date): TestAlert[] {
  const endsAt = new Date(now.getTime() + TEST_MINUTES * 60_000).toISOString();
  return rules.map((rule) => ({
    labels: {
      alertname: rule.title,
      severity: rule.severity,
      grafana_folder: FOLDER_TITLE,
      env,
      drill: 'true',
    },
    annotations: { summary: `Drill: ${rule.summary}`, runbook: rule.runbook ?? '' },
    startsAt: now.toISOString(),
    endsAt,
  }));
}

/** P1 rules, plus the first P2 so the always-on route is exercised too. */
export function drillRules(all: readonly AlertRule[]): AlertRule[] {
  const p2 = all.find((rule) => rule.severity === 'P2');
  return [...all.filter((rule) => rule.severity === 'P1'), ...(p2 ? [p2] : [])];
}

interface AmAlert {
  readonly labels: Record<string, string>;
  readonly status: { readonly state: string; readonly mutedBy?: readonly string[] };
}

/** Compares what Alertmanager holds with what the routing should do; returns the mismatches. */
export function checkRouting(
  sent: readonly TestAlert[],
  held: readonly AmAlert[],
  now: Date,
): string[] {
  const problems: string[] = [];
  for (const alert of sent) {
    const match = held.find((h) => h.labels.alertname === alert.labels.alertname);
    const severity = alert.labels.severity as AlertRule['severity'];
    const expected = expectedState(severity, now);
    if (!match) {
      problems.push(`${alert.labels.alertname}: not held by Alertmanager`);
    } else if (match.status.state !== expected) {
      problems.push(`${alert.labels.alertname}: ${match.status.state}, expected ${expected}`);
    } else if (expected === 'suppressed' && !(match.status.mutedBy ?? []).includes(MUTE_TIMING)) {
      problems.push(`${alert.labels.alertname}: suppressed, but not by ${MUTE_TIMING}`);
    }
  }
  return problems;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((arg, index) => !(index === 0 && arg === '--'));
  const { values } = parseArgs({
    args,
    options: {
      staging: { type: 'boolean', default: false },
      production: { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
    },
  });
  const env = values.production ? 'production' : 'staging';
  const rules = drillRules(loadMonitoring(REPO_ROOT).ruleFiles.flatMap((file) => file.rules));
  const now = new Date();
  const alerts = buildTestAlerts(rules, env, now);
  for (const alert of alerts) {
    const expected = expectedState(alert.labels.severity as AlertRule['severity'], now);
    console.log(`${alert.labels.severity} ${alert.labels.alertname}: expect ${expected}`);
  }
  if (values['dry-run']) return;

  const base = required('GRAFANA_URL').replace(/\/$/u, '');
  const headers = {
    authorization: `Bearer ${required('GRAFANA_TOKEN')}`,
    'content-type': 'application/json',
  };
  const posted = await fetch(`${base}/api/alertmanager/grafana/api/v2/alerts`, {
    method: 'POST',
    headers,
    body: JSON.stringify(alerts),
  });
  if (!posted.ok) throw new Error(`posting test alerts failed: ${posted.status}`);

  // Alertmanager applies the policy when it groups the alerts (group_wait 30 s for P1).
  await new Promise((resolve) => setTimeout(resolve, 45_000));
  const held = await fetch(
    `${base}/api/alertmanager/grafana/api/v2/alerts?filter=${encodeURIComponent('drill="true"')}`,
    { headers },
  );
  if (!held.ok) throw new Error(`reading alerts failed: ${held.status}`);
  const problems = checkRouting(alerts, (await held.json()) as AmAlert[], now);
  if (problems.length > 0) {
    console.error(problems.join('\n'));
    process.exitCode = 1;
    return;
  }
  console.log(`routing ok for ${alerts.length} alerts; they resolve in ${TEST_MINUTES} minutes`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
