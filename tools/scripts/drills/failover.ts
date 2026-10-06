/**
 * Failover drill (quarterly, docs/runbooks/failover.md): switches a PlanetScale Postgres branch's
 * primary over to a replica and measures what each part of the stack loses: database writes, the
 * api's `/health`, and PowerSync's logical replication slot (same slot back = no re-snapshot).
 * Recovery target: 5 minutes for the api and writes (docs/system-architecture.md §10, RTO 2 h).
 *
 *   DRILL_DATABASE_URL=postgres://<direct :5432 role>… API_BASE_URL=https://api-staging-… \
 *   pnpm tsx tools/scripts/drills/failover.ts --staging --branch staging [--dry-run]
 *
 * Refuses the production branch (`main`) and anything without `--staging`. Needs `pscale` logged in.
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import pg from 'pg';

export const RECOVERY_TARGET_SECONDS = 5 * 60;
const POLL_MS = 5_000;
const MAX_SECONDS = 45 * 60;

export interface Sample {
  readonly at: number;
  readonly dbOk: boolean;
  readonly apiOk: boolean;
  readonly slots: readonly { name: string; active: boolean }[];
}

export interface DrillResult {
  readonly dbDownSeconds: number;
  readonly apiDownSeconds: number;
  /** Seconds from the switchover until a replication slot was active again; null if never. */
  readonly slotBackSeconds: number | null;
  readonly slotSurvived: boolean;
  readonly passed: boolean;
}

/** Refuses anything but an explicit non-production branch. */
export function assertDrillTarget(branch: string | undefined, staging: boolean): string {
  if (!staging) throw new Error('pass --staging: the drill never runs against production');
  if (!branch || branch === 'main' || branch === 'production') {
    throw new Error(`refusing branch ${branch ?? '(none)'}: use a staging or drill branch`);
  }
  return branch;
}

/** Sums the time the database and the api were unreachable and follows the slot. */
export function summarise(
  before: readonly string[],
  startedAt: number,
  samples: readonly Sample[],
): DrillResult {
  let dbDown = 0;
  let apiDown = 0;
  let previous = startedAt;
  let slotBack: number | null = null;
  let survived = false;
  for (const sample of samples) {
    const span = (sample.at - previous) / 1000;
    if (!sample.dbOk) dbDown += span;
    if (!sample.apiOk) apiDown += span;
    previous = sample.at;
    const active = sample.slots.filter((slot) => slot.active);
    if (slotBack === null && active.length > 0) {
      slotBack = (sample.at - startedAt) / 1000;
      survived = active.some((slot) => before.includes(slot.name));
    }
  }
  const passed =
    dbDown <= RECOVERY_TARGET_SECONDS && apiDown <= RECOVERY_TARGET_SECONDS && slotBack !== null;
  return {
    dbDownSeconds: Math.round(dbDown),
    apiDownSeconds: Math.round(apiDown),
    slotBackSeconds: slotBack === null ? null : Math.round(slotBack),
    slotSurvived: survived,
    passed,
  };
}

async function sample(databaseUrl: string, apiBase: string): Promise<Sample> {
  const at = Date.now();
  let dbOk = false;
  let slots: { name: string; active: boolean }[] = [];
  const client = new pg.Client({ connectionString: databaseUrl, connectionTimeoutMillis: 4_000 });
  try {
    await client.connect();
    await client.query('SELECT 1');
    dbOk = true;
    const { rows } = await client.query<{ slot_name: string; active: boolean }>(
      "SELECT slot_name, active FROM pg_replication_slots WHERE slot_type = 'logical'",
    );
    slots = rows.map((row) => ({ name: row.slot_name, active: row.active }));
  } catch {
    // Unreachable during the switchover: dbOk stays false.
  } finally {
    await client.end().catch(() => undefined);
  }
  let apiOk = false;
  try {
    const response = await fetch(`${apiBase}/health`, { signal: AbortSignal.timeout(4_000) });
    apiOk = response.ok;
  } catch {
    // Unreachable or timed out: apiOk stays false.
  }
  return { at, dbOk, apiOk, slots };
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
      branch: { type: 'string' },
      database: { type: 'string', default: 'critterpass' },
      org: { type: 'string', default: 'critterpass' },
      'dry-run': { type: 'boolean', default: false },
    },
  });
  const branch = assertDrillTarget(values.branch, values.staging);
  const databaseUrl = required('DRILL_DATABASE_URL');
  const apiBase = required('API_BASE_URL').replace(/\/$/u, '');

  const first = await sample(databaseUrl, apiBase);
  const before = first.slots.map((slot) => slot.name);
  console.log(`before: db ${first.dbOk}, api ${first.apiOk}, slots [${before.join(', ')}]`);
  if (!first.dbOk || !first.apiOk) throw new Error('the stack is not healthy before the drill');
  const command = ['branch', 'switchover', values.database, branch, '--org', values.org];
  if (values['dry-run']) {
    console.log(`would run: pscale ${command.join(' ')}`);
    return;
  }

  const startedAt = Date.now();
  execFileSync('pscale', [...command, '--force'], { stdio: 'inherit' });
  const samples: Sample[] = [];
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    const next = await sample(databaseUrl, apiBase);
    samples.push(next);
    const healthy = next.dbOk && next.apiOk && next.slots.some((slot) => slot.active);
    if (healthy && samples.length >= 6) break;
    if ((Date.now() - startedAt) / 1000 > MAX_SECONDS) break;
  }
  const result = summarise(before, startedAt, samples);
  console.log(JSON.stringify(result, null, 2));
  console.log(
    `| ${new Date().toISOString().slice(0, 10)} | ${branch} | ${result.dbDownSeconds} s | ${result.apiDownSeconds} s | ` +
      `${result.slotBackSeconds ?? 'never'} s | ${result.slotSurvived ? 'yes' : 'no (re-snapshot)'} |`,
  );
  process.exitCode = result.passed ? 0 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
