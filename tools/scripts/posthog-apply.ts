/**
 * Provisions the PostHog EU project from infra/monitoring/posthog, idempotently: project privacy
 * settings (client IP discarded), dashboards matched by name, and insights matched by name and
 * attached to their dashboard. `--dry-run` validates the files, including that every event and
 * property an insight uses exists in the analytics catalog (`@cp/domain`).
 *
 *   pnpm tsx tools/scripts/posthog-apply.ts --dry-run
 *   pnpm tsx tools/scripts/posthog-apply.ts
 *
 * Apply reads POSTHOG_PERSONAL_API_KEY, POSTHOG_PROJECT_ID and POSTHOG_API_HOST (default
 * https://eu.posthog.com). Retention (13 months) is a plan setting, not an API field.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { getAnalyticsEventSchema, isAnalyticsEventName } from '@cp/domain';
import { z } from 'zod';

const ROOT = fileURLToPath(new URL('../../infra/monitoring/posthog/', import.meta.url));

const eventsNodeSchema = z.object({
  kind: z.literal('EventsNode'),
  event: z.string(),
  math: z.string().optional(),
  math_property: z.string().optional(),
  custom_name: z.string().optional(),
  properties: z.array(z.object({ key: z.string(), value: z.unknown() })).optional(),
});

const insightSchema = z.object({
  key: z.string().regex(/^[a-z0-9-]+$/u),
  name: z.string().min(1),
  dashboard: z.string(),
  query: z.object({
    kind: z.literal('InsightVizNode'),
    source: z.object({
      kind: z.enum(['FunnelsQuery', 'TrendsQuery']),
      series: z.array(eventsNodeSchema).min(1),
      breakdownFilter: z.object({ breakdown: z.string() }).optional(),
    }),
  }),
});
export type Insight = z.infer<typeof insightSchema>;

const dashboardSchema = z.object({
  key: z.string(),
  name: z.string().startsWith('CritterPass / '),
  description: z.string(),
});
export type Dashboard = z.infer<typeof dashboardSchema>;

export interface PosthogConfig {
  readonly insights: readonly Insight[];
  readonly dashboards: readonly Dashboard[];
}

/** PostHog's own event properties an insight may use besides the catalog's. */
const SYSTEM_PROPERTIES = new Set(['$current_url', '$pathname']);

export function loadPosthogConfig(root = ROOT): PosthogConfig {
  const insights = z
    .array(insightSchema)
    .parse(JSON.parse(readFileSync(`${root}insights.json`, 'utf8')));
  const dashboards = z
    .array(dashboardSchema)
    .parse(JSON.parse(readFileSync(`${root}dashboards.json`, 'utf8')));
  const problems: string[] = [];
  const dashboardKeys = new Set(dashboards.map((dashboard) => dashboard.key));
  for (const insight of insights) {
    if (!dashboardKeys.has(insight.dashboard)) problems.push(`${insight.key}: unknown dashboard`);
    const breakdown = insight.query.source.breakdownFilter?.breakdown;
    for (const node of insight.query.source.series) {
      if (!isAnalyticsEventName(node.event)) {
        problems.push(`${insight.key}: ${node.event} is not a catalog event`);
        continue;
      }
      const keys = Object.keys(getAnalyticsEventSchema(node.event).shape);
      const used = [
        ...(node.properties ?? []).map((property) => property.key),
        ...(node.math_property ? [node.math_property] : []),
        ...(breakdown ? [breakdown] : []),
      ];
      for (const key of used) {
        if (!keys.includes(key) && !SYSTEM_PROPERTIES.has(key)) {
          problems.push(`${insight.key}: ${node.event} has no property ${key}`);
        }
      }
    }
  }
  const names = insights.map((insight) => insight.name);
  if (new Set(names).size !== names.length) problems.push('insight names must be unique');
  if (problems.length > 0) throw new Error(`posthog config invalid:\n- ${problems.join('\n- ')}`);
  return { insights, dashboards };
}

export type Http = (method: string, path: string, body?: unknown) => Promise<unknown>;

export function posthogHttp(host: string, apiKey: string, fetchImpl: typeof fetch = fetch): Http {
  return async (method, path, body) => {
    const response = await fetchImpl(new URL(path, host), {
      method,
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) throw new Error(`${method} ${path} failed with HTTP ${response.status}`);
    const text = await response.text();
    return text ? (JSON.parse(text) as unknown) : null;
  };
}

interface Named {
  id: number;
  name: string;
}

async function listAll(http: Http, path: string): Promise<Named[]> {
  const out: Named[] = [];
  let next: string | null = `${path}?limit=200`;
  while (next) {
    const page = (await http('GET', next)) as { results: Named[]; next: string | null };
    out.push(...page.results);
    next = page.next ? new URL(page.next).pathname + new URL(page.next).search : null;
  }
  return out;
}

export async function applyPosthog(
  config: PosthogConfig,
  http: Http,
  projectId: string,
): Promise<string[]> {
  const base = `/api/projects/${projectId}`;
  const log: string[] = [];
  await http('PATCH', `${base}/`, { anonymize_ips: true });

  const existingDashboards = await listAll(http, `${base}/dashboards/`);
  const dashboardIds = new Map<string, number>();
  for (const dashboard of config.dashboards) {
    const body = { name: dashboard.name, description: dashboard.description, tags: ['as-code'] };
    const found = existingDashboards.find((candidate) => candidate.name === dashboard.name);
    if (found) {
      await http('PATCH', `${base}/dashboards/${found.id}/`, body);
      dashboardIds.set(dashboard.key, found.id);
    } else {
      const created = (await http('POST', `${base}/dashboards/`, body)) as Named;
      dashboardIds.set(dashboard.key, created.id);
      log.push(`created dashboard ${dashboard.name}`);
    }
  }

  const existingInsights = await listAll(http, `${base}/insights/`);
  for (const insight of config.insights) {
    const body = {
      name: insight.name,
      description: `as-code key ${insight.key}`,
      query: insight.query,
      dashboards: [dashboardIds.get(insight.dashboard)],
      tags: ['as-code'],
    };
    const found = existingInsights.find((candidate) => candidate.name === insight.name);
    if (found) await http('PATCH', `${base}/insights/${found.id}/`, body);
    else {
      await http('POST', `${base}/insights/`, body);
      log.push(`created insight ${insight.name}`);
    }
  }
  return log;
}

async function main() {
  const args = process.argv.slice(2).filter((arg, index) => !(index === 0 && arg === '--'));
  const { values } = parseArgs({
    args,
    options: { 'dry-run': { type: 'boolean', default: false } },
  });
  const config = loadPosthogConfig();
  console.log(`valid: ${config.insights.length} insights, ${config.dashboards.length} dashboards`);
  if (values['dry-run']) return;
  const apiKey = process.env['POSTHOG_PERSONAL_API_KEY'];
  const projectId = process.env['POSTHOG_PROJECT_ID'];
  if (!apiKey || !projectId)
    throw new Error('POSTHOG_PERSONAL_API_KEY and POSTHOG_PROJECT_ID are required');
  const http = posthogHttp(process.env['POSTHOG_API_HOST'] ?? 'https://eu.posthog.com', apiKey);
  console.log((await applyPosthog(config, http, projectId)).join('\n'));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
