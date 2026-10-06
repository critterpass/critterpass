/**
 * Release health for the staged rollout: the crash-free session rate of one app release in Sentry,
 * against the halt line (99.5%). Read-only: it never changes a rollout; a result below the line
 * fails the run, and docs/runbooks/release.md says how to halt.
 *
 *   SENTRY_AUTH_TOKEN=… pnpm tsx tools/scripts/perf/release-health.ts --release app.critterpass@1.0.0+12
 *     [--environment production] [--period 24h] [--min 99.5] [--min-sessions 200]
 */
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

export const SENTRY_ORG = 'critterpass';
export const SENTRY_PROJECT = 'critterpass';

export interface ReleaseHealth {
  readonly sessions: number;
  /** Percent of sessions without a crash; undefined when Sentry has none for the release. */
  readonly crashFreePercent: number | undefined;
}

export type HealthVerdict = 'healthy' | 'halt' | 'not-enough-data';

/** Reads the totals of a Sentry sessions query grouped into one row. */
export function parseSessions(body: unknown): ReleaseHealth {
  const totals = (body as { groups?: { totals?: Record<string, number | null> }[] }).groups?.[0]
    ?.totals;
  const rate = totals?.['crash_free_rate(session)'];
  return {
    sessions: totals?.['sum(session)'] ?? 0,
    crashFreePercent: typeof rate === 'number' ? Math.round(rate * 10_000) / 100 : undefined,
  };
}

/** Too few sessions say nothing either way: the rollout step waits rather than halts or widens. */
export function healthVerdict(
  health: ReleaseHealth,
  minPercent: number,
  minSessions: number,
): HealthVerdict {
  if (health.crashFreePercent === undefined || health.sessions < minSessions) {
    return 'not-enough-data';
  }
  return health.crashFreePercent >= minPercent ? 'healthy' : 'halt';
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      release: { type: 'string' },
      environment: { type: 'string', default: 'production' },
      period: { type: 'string', default: '24h' },
      min: { type: 'string', default: '99.5' },
      'min-sessions': { type: 'string', default: '200' },
    },
  });
  const token = process.env.SENTRY_AUTH_TOKEN;
  if (!values.release || !token) throw new Error('--release and SENTRY_AUTH_TOKEN are required');
  const params = new URLSearchParams({
    project: '-1',
    statsPeriod: values.period,
    interval: values.period,
    environment: values.environment,
    query: `release:"${values.release}"`,
  });
  params.append('field', 'crash_free_rate(session)');
  params.append('field', 'sum(session)');
  const response = await fetch(
    `https://sentry.io/api/0/organizations/${SENTRY_ORG}/sessions/?${params.toString()}`,
    { headers: { authorization: `Bearer ${token}` } },
  );
  if (!response.ok) throw new Error(`sentry sessions query failed: ${response.status}`);
  const health = parseSessions(await response.json());
  const verdict = healthVerdict(health, Number(values.min), Number(values['min-sessions']));
  console.log(
    `${values.release} (${values.environment}, ${values.period}): ${health.sessions} sessions, ` +
      `crash-free ${health.crashFreePercent ?? '–'}% (halt below ${values.min}%) → ${verdict}`,
  );
  // Not enough data exits 2 so a caller can tell "wait" from "halt".
  process.exitCode = verdict === 'healthy' ? 0 : verdict === 'halt' ? 1 : 2;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
