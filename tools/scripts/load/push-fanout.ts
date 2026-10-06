/**
 * Push fan-out burst against FCM in validate-only mode: builds one message per member for
 * `--crews` crews of `--members` (default 1,000 × 6) from real device tokens, sends them with the
 * worker's concurrency and measures throughput and errors. Validate-only means FCM checks every
 * message and token but delivers nothing. APNs has no validate-only mode; its sandbox burst is a
 * manual run on the test devices (README).
 *
 *   FCM_SERVICE_ACCOUNT_JSON=certs/fcm-staging.json pnpm tsx tools/scripts/load/push-fanout.ts \
 *     --tokens fcm-tokens.txt [--crews 1000 --members 6 --concurrency 50]
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { googleAccessToken, type ServiceAccount } from '../store-kit/google-auth';
import { percentile } from './sessions';

const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

export interface Outcome {
  readonly ok: boolean;
  readonly ms: number;
  readonly error?: string;
}

/** Runs `tasks` with at most `limit` in flight. */
export async function pool<T>(tasks: readonly (() => Promise<T>)[], limit: number): Promise<T[]> {
  const results: T[] = new Array<T>(tasks.length);
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const index = next;
      next += 1;
      results[index] = await (tasks[index] as () => Promise<T>)();
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}

export function summarise(outcomes: readonly Outcome[], seconds: number) {
  const errors: Record<string, number> = {};
  for (const o of outcomes)
    if (!o.ok) errors[o.error ?? 'unknown'] = (errors[o.error ?? 'unknown'] ?? 0) + 1;
  return {
    messages: outcomes.length,
    failed: outcomes.filter((o) => !o.ok).length,
    perSecond: Math.round(outcomes.length / Math.max(seconds, 0.001)),
    p95Ms: percentile(
      outcomes.map((o) => o.ms),
      95,
    ),
    errors,
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((arg, index) => !(index === 0 && arg === '--'));
  const { values } = parseArgs({
    args,
    options: {
      tokens: { type: 'string' },
      crews: { type: 'string', default: '1000' },
      members: { type: 'string', default: '6' },
      concurrency: { type: 'string', default: '50' },
    },
  });
  const file = process.env.FCM_SERVICE_ACCOUNT_JSON;
  if (!file || !values.tokens)
    throw new Error('FCM_SERVICE_ACCOUNT_JSON and --tokens are required');
  const account = JSON.parse(readFileSync(file, 'utf8')) as ServiceAccount;
  if (!account.project_id) throw new Error('the service account has no project_id');
  const deviceTokens = readFileSync(values.tokens, 'utf8').split('\n').filter(Boolean);
  if (deviceTokens.length === 0) throw new Error('no device tokens');
  const accessToken = await googleAccessToken(account, SCOPE);
  const url = `https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`;

  const total = Number(values.crews) * Number(values.members);
  const tasks = Array.from({ length: total }, (_, i) => async (): Promise<Outcome> => {
    const started = Date.now();
    const response = await fetch(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        validate_only: true,
        message: {
          token: deviceTokens[i % deviceTokens.length],
          notification: {
            title: 'Load test',
            body: `crew ${Math.floor(i / Number(values.members))}`,
          },
          android: { priority: 'high' },
        },
      }),
    });
    const ms = Date.now() - started;
    if (response.ok) return { ok: true, ms };
    const body = (await response.json().catch(() => ({}))) as { error?: { status?: string } };
    return { ok: false, ms, error: body.error?.status ?? String(response.status) };
  });
  const started = Date.now();
  const outcomes = await pool(tasks, Number(values.concurrency));
  console.log(JSON.stringify(summarise(outcomes, (Date.now() - started) / 1000), null, 2));
  process.exitCode = outcomes.every((o) => o.ok) ? 0 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
