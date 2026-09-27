/**
 * Loads and validates the monitoring-as-code files under infra/monitoring (dashboards, alert
 * rules, the notification policy and synthetic checks) and turns alert rules into Grafana's
 * provisioning API shape. Shared by grafana-apply.ts and its tests; no network here.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parse } from 'yaml';
import { z } from 'zod';

export const PROBE_NAMES = ['Singapore', 'Frankfurt'] as const;

const dashboardSchema = z.object({
  uid: z.string().regex(/^cp-[a-z0-9-]+$/u),
  title: z.string().startsWith('CritterPass / '),
  panels: z
    .array(
      z.object({
        title: z.string().min(1),
        targets: z.array(z.object({ expr: z.string().min(1) })).min(1),
      }),
    )
    .min(1),
});

const ruleSchema = z.object({
  uid: z.string().regex(/^cp-p[12]-[a-z0-9-]+$/u),
  title: z.string().min(1),
  severity: z.enum(['P1', 'P2']),
  runbook: z.string().optional(),
  for: z.string().regex(/^\d+[smh]$/u),
  expr: z.string().min(1),
  op: z.enum(['gt', 'lt']),
  threshold: z.number(),
  noData: z.enum(['OK', 'NoData', 'Alerting']).default('NoData'),
  summary: z.string().min(1),
});
export type AlertRule = z.infer<typeof ruleSchema>;

const ruleFileSchema = z.object({
  group: z.string().regex(/^[a-z0-9-]+$/u),
  interval: z.string().regex(/^\d+[smh]$/u),
  rules: z.array(ruleSchema).min(1),
});
export type RuleFile = z.infer<typeof ruleFileSchema>;

const policyFileSchema = z.object({
  contactPoints: z
    .array(
      z.object({
        uid: z.string(),
        name: z.string(),
        type: z.string(),
        settings: z.record(z.string(), z.unknown()),
      }),
    )
    .min(1),
  muteTimings: z.array(z.object({ name: z.string(), time_intervals: z.array(z.unknown()) })),
  policy: z.object({ receiver: z.string(), routes: z.array(z.record(z.string(), z.unknown())) }),
});
export type PolicyFile = z.infer<typeof policyFileSchema>;

const syntheticsSchema = z.object({
  environment: z.enum(['staging', 'production']),
  frequencyMs: z.number().int().min(10_000),
  timeoutMs: z.number().int().max(60_000),
  probes: z.array(z.enum(PROBE_NAMES)).min(2),
  checks: z
    .array(
      z.object({
        job: z.string().regex(/^[a-z0-9-]+$/u),
        target: z.url().startsWith('https://'),
        validStatusCodes: z.array(z.number().int()),
        signedObjectKey: z.string().optional(),
      }),
    )
    .min(1),
});
export type Synthetics = z.infer<typeof syntheticsSchema>;

export interface MonitoringConfig {
  readonly dashboards: readonly (z.infer<typeof dashboardSchema> & Record<string, unknown>)[];
  readonly ruleFiles: readonly RuleFile[];
  readonly policy: PolicyFile;
  readonly synthetics: readonly Synthetics[];
}

const files = (dir: string, ext: string) =>
  readdirSync(dir)
    .filter((name) => name.endsWith(ext))
    .sort()
    .map((name) => join(dir, name));

/** Reads every file and fails with every problem found, not just the first. */
export function loadMonitoring(repoRoot: string): MonitoringConfig {
  const root = join(repoRoot, 'infra/monitoring');
  const problems: string[] = [];
  const check = <T>(schema: z.ZodType<T>, value: unknown, file: string): T | undefined => {
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
      problems.push(
        `${file}: ${parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; ')}`,
      );
      return undefined;
    }
    return parsed.data;
  };

  const dashboards = files(join(root, 'dashboards'), '.json').flatMap((file) => {
    const raw = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
    const parsed = check(dashboardSchema, raw, file);
    return parsed ? [{ ...raw, ...parsed }] : [];
  });
  let policy: PolicyFile | undefined;
  const ruleFiles: RuleFile[] = [];
  for (const file of files(join(root, 'alerts'), '.yaml')) {
    const raw = parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
    if ('contactPoints' in raw) policy = check(policyFileSchema, raw, file);
    else {
      const parsed = check(ruleFileSchema, raw, file);
      if (parsed) ruleFiles.push(parsed);
    }
  }
  const synthetics = files(join(root, 'synthetics'), '.json').flatMap((file) => {
    const parsed = check(syntheticsSchema, JSON.parse(readFileSync(file, 'utf8')), file);
    return parsed ? [parsed] : [];
  });

  const uids = [
    ...dashboards.map((d) => d.uid),
    ...ruleFiles.flatMap((f) => f.rules.map((r) => r.uid)),
  ];
  for (const uid of new Set(uids.filter((uid, index) => uids.indexOf(uid) !== index))) {
    problems.push(`duplicate uid ${uid}`);
  }
  for (const rule of ruleFiles.flatMap((file) => file.rules)) {
    if (rule.severity !== 'P1') continue;
    const runbook = join(repoRoot, 'docs/runbooks/alerts', `${rule.runbook ?? ''}.md`);
    if (!rule.runbook || !existsSync(runbook))
      problems.push(`${rule.uid}: P1 rule needs a runbook`);
  }
  if (policy === undefined) problems.push('alerts: notification policy file missing');
  if (problems.length > 0 || policy === undefined) {
    throw new Error(`monitoring config invalid:\n- ${problems.join('\n- ')}`);
  }
  return { dashboards, ruleFiles, policy, synthetics };
}

export const ALERT_FOLDER_UID = 'cp-alerts';

/** One rule in Grafana's provisioning shape: A = the PromQL query, B = the threshold on A. */
export function toGrafanaRule(
  rule: AlertRule,
  file: RuleFile,
  datasourceUid: string,
  runbookBase: string,
) {
  return {
    uid: rule.uid,
    title: rule.title,
    folderUID: ALERT_FOLDER_UID,
    ruleGroup: file.group,
    condition: 'B',
    for: rule.for,
    noDataState: rule.noData,
    execErrState: 'Error',
    labels: { severity: rule.severity },
    annotations: {
      summary: rule.summary,
      ...(rule.runbook ? { runbook_url: `${runbookBase}/${rule.runbook}.md` } : {}),
    },
    data: [
      {
        refId: 'A',
        datasourceUid,
        relativeTimeRange: { from: 900, to: 0 },
        model: { refId: 'A', expr: rule.expr, instant: true },
      },
      {
        refId: 'B',
        datasourceUid: '__expr__',
        relativeTimeRange: { from: 0, to: 0 },
        model: {
          refId: 'B',
          type: 'threshold',
          expression: 'A',
          conditions: [{ evaluator: { type: rule.op, params: [rule.threshold] } }],
        },
      },
    ],
  };
}
