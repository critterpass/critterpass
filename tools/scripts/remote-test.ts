/**
 * Runs one package's suite on a GitHub runner (`.github/workflows/remote-tests.yml`) instead of
 * this Mac, so database suites (Testcontainers) and other heavy tests never need the local Docker.
 * The branch must be pushed: the runner tests what is on GitHub.
 *
 *   pnpm test:remote @cp/api -- test/routes/guide.db.test.ts
 *   pnpm test:remote @cp/worker --script test -- -t "phrase audio"
 *
 * Dispatches the workflow, finds the run by a unique label, waits (polling every 30 s, at most
 * 50 min), prints the failing tests and the summary, and exits non-zero unless the run passed.
 */
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const WORKFLOW = 'remote-tests.yml';
const POLL_MS = 30_000;
const MAX_POLLS = 100;

export interface RemoteTestRequest {
  readonly packageName: string;
  readonly script: string;
  readonly args: string;
}

/** Reads `<package> [--script name] [-- args…]`; pnpm may forward a literal `--`. */
export function parseArgs(argv: readonly string[]): RemoteTestRequest {
  const rest = [...argv];
  const split = rest.indexOf('--');
  const passthrough = split === -1 ? [] : rest.splice(split).slice(1);
  let script = 'test:db';
  const positional: string[] = [];
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i] ?? '';
    if (arg === '--script') {
      script = rest[i + 1] ?? script;
      i += 1;
    } else {
      positional.push(arg);
    }
  }
  const packageName = positional[0];
  if (packageName === undefined || !packageName.startsWith('@cp/')) {
    throw new Error('usage: pnpm test:remote @cp/<package> [--script test:db] [-- <test args>]');
  }
  const args = passthrough.map((a) => (/[\s"']/u.test(a) ? JSON.stringify(a) : a)).join(' ');
  return { packageName, script, args };
}

/** Summary and failure lines worth showing from a vitest/jest log. */
export function interestingLines(log: string): string[] {
  return log
    .split('\n')
    .map((line) => line.replace(/^.*?\d{4}-\d\d-\d\dT[\d:.]+Z\s?/u, ''))
    .filter((line) =>
      /(Test Files|Tests\s|✕|×|FAIL\s|● |Error:|AssertionError|Tasks:|Failed:)/u.test(line),
    )
    .slice(-60);
}

function gh(args: readonly string[]): string {
  return execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();
}

function git(args: readonly string[]): string {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  const request = parseArgs(process.argv.slice(2));
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
  git(['fetch', '-q', 'origin', branch]);
  if (git(['rev-parse', 'HEAD']) !== git(['rev-parse', `origin/${branch}`])) {
    throw new Error(`push ${branch} first: the runner tests what is on GitHub`);
  }
  const label = `rt-${randomUUID().slice(0, 8)}`;
  gh([
    'workflow',
    'run',
    WORKFLOW,
    '--ref',
    branch,
    '-f',
    `package=${request.packageName}`,
    '-f',
    `script=${request.script}`,
    '-f',
    `args=${request.args}`,
    '-f',
    `label=${label}`,
  ]);
  console.log(`dispatched ${request.packageName} ${request.script} ${request.args} (${label})`);

  let runId: string | undefined;
  for (let poll = 0; poll < MAX_POLLS; poll += 1) {
    await sleep(poll === 0 ? 10_000 : POLL_MS);
    if (runId === undefined) {
      const runs = JSON.parse(
        gh([
          'run',
          'list',
          '--workflow',
          WORKFLOW,
          '--branch',
          branch,
          '--limit',
          '20',
          '--json',
          'databaseId,displayTitle',
        ]),
      ) as { databaseId: number; displayTitle: string }[];
      runId = runs.find((run) => run.displayTitle.includes(label))?.databaseId.toString();
      if (runId !== undefined) console.log(`run ${runId}`);
      continue;
    }
    const view = JSON.parse(gh(['run', 'view', runId, '--json', 'status,conclusion,url'])) as {
      status: string;
      conclusion: string;
      url: string;
    };
    if (view.status !== 'completed') continue;
    const log = gh(['run', 'view', runId, '--log']);
    for (const line of interestingLines(log)) console.log(line);
    console.log(`${view.conclusion}: ${view.url}`);
    process.exit(view.conclusion === 'success' ? 0 : 1);
  }
  throw new Error(`gave up waiting for run ${runId ?? '(not found yet)'}`);
}

if (import.meta.url === `file://${process.argv[1] ?? ''}`) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
