/**
 * Starts an EAS Workflows Maestro run for the current project state and waits for it to finish.
 * Cloud-only: no native build or simulator/emulator runs on this machine (docs/code-standards.md
 * §17). Reuses the last matching build for the project's fingerprint via the workflow's own
 * fingerprint -> get-build -> conditional-build -> maestro jobs (.eas/workflows/e2e-<platform>.yml);
 * a fresh EAS build is only triggered when no matching build exists, so JS-only changes don't
 * consume the account's monthly build quota.
 *
 *   pnpm e2e:cloud -- --platform ios
 *   pnpm e2e:cloud -- --platform android --flows e2e/smoke
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { parseArgs } from 'node:util';

const REPO_ROOT = path.resolve(import.meta.dirname, '../..');
const MOBILE_DIR = path.join(REPO_ROOT, 'apps/mobile');
const DEFAULT_FLOWS = 'e2e/smoke/app-launch.yaml';
const PLATFORMS = ['ios', 'android'] as const;
export type Platform = (typeof PLATFORMS)[number];

export interface CliOptions {
  platform: Platform;
  /** Repo-root-relative, e.g. `e2e/smoke/app-launch.yaml` or `e2e/crew` (matches --flows). */
  flows: string;
}

export class CliArgsError extends Error {}

/** Pure arg parsing: no process/network access, safe to unit test directly. */
export function parseCliArgs(argv: string[]): CliOptions {
  // pnpm forwards a literal `--` separator ahead of the script's own args; drop it.
  const args = argv.filter((arg, index) => !(index === 0 && arg === '--'));
  const { values } = parseArgs({
    args,
    options: {
      platform: { type: 'string' },
      flows: { type: 'string' },
    },
  });

  const { platform } = values;
  if (!platform) throw new CliArgsError('--platform is required (ios or android)');
  if (!PLATFORMS.includes(platform as Platform)) {
    throw new CliArgsError(`--platform must be one of ${PLATFORMS.join(', ')}, got "${platform}"`);
  }

  return { platform: platform as Platform, flows: values.flows ?? DEFAULT_FLOWS };
}

/** Raw shape of an EAS Workflows job, as returned by `eas workflow:run --json` / `workflow:view --json`. */
interface WorkflowJob {
  key?: unknown;
  name?: unknown;
  type?: unknown;
  status?: unknown;
  errors?: unknown;
}

/** Raw shape of a completed workflow run. Parsed defensively: this is a preview product's CLI output. */
export interface WorkflowRunResult {
  id?: unknown;
  status?: unknown;
  logURL?: unknown;
  jobs?: unknown;
}

export interface CommandResult {
  exitCode: number;
  message: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function jobsOf(run: WorkflowRunResult): WorkflowJob[] {
  return Array.isArray(run.jobs) ? run.jobs.filter(isRecord) : [];
}

function errorMessages(errors: unknown): string[] {
  if (!Array.isArray(errors)) return [];
  return errors.map((error) => {
    if (isRecord(error) && typeof error.message === 'string') return error.message;
    return JSON.stringify(error);
  });
}

function jobLabel(job: WorkflowJob): string {
  if (typeof job.name === 'string' && job.name) return job.name;
  if (typeof job.key === 'string' && job.key) return job.key;
  return 'unknown job';
}

/**
 * Maps a completed workflow run to a script exit code + message. Pure and unit-testable: the
 * network boundary is the eas-cli child process that produces `run`, not this mapping.
 */
export function mapRunResult(run: WorkflowRunResult): CommandResult {
  const status = typeof run.status === 'string' ? run.status : 'UNKNOWN';
  const logUrl = typeof run.logURL === 'string' ? run.logURL : undefined;

  if (status === 'SUCCESS') {
    return {
      exitCode: 0,
      message: `E2E run succeeded.${logUrl ? `\nLogs: ${logUrl}` : ''}`,
    };
  }

  const failingJobs = jobsOf(run).filter(
    (job) => job.status === 'FAILURE' || job.status === 'ERRORED',
  );
  const failureDetails = failingJobs
    .map((job) => {
      const messages = errorMessages(job.errors);
      const detail = messages.length > 0 ? `: ${messages.join('; ')}` : '';
      return `  - ${jobLabel(job)}${detail}`;
    })
    .join('\n');

  const lines = [
    `E2E run did not succeed (status: ${status}).`,
    ...(failureDetails ? ['Failing job(s):', failureDetails] : []),
    ...(logUrl ? [`Logs: ${logUrl}`] : []),
  ];

  return { exitCode: 1, message: lines.join('\n') };
}

/**
 * The workflow's `flows` input is resolved by Maestro relative to the app's base directory
 * (apps/mobile), not the git repo root where e2e/ actually lives. Pure and unit-testable.
 */
export function toAppRelativeFlows(repoRootRelativeFlows: string): string {
  return path.relative(MOBILE_DIR, path.join(REPO_ROOT, repoRootRelativeFlows));
}

/** Real eas-cli invocation: the network boundary, kept thin and injectable for tests. */
export function runEasWorkflow(options: CliOptions): WorkflowRunResult {
  const workflowFile = path.join(REPO_ROOT, '.eas/workflows', `e2e-${options.platform}.yml`);
  const relativeWorkflowFile = path.relative(MOBILE_DIR, workflowFile);

  const result = spawnSync(
    'npx',
    [
      '--yes',
      'eas-cli',
      'workflow:run',
      relativeWorkflowFile,
      '--non-interactive',
      '--wait',
      '--json',
      '-F',
      `flows=${toAppRelativeFlows(options.flows)}`,
    ],
    {
      cwd: MOBILE_DIR,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'inherit'],
      maxBuffer: 16 * 1024 * 1024,
    },
  );

  if (result.error) throw result.error;

  const stdout = result.stdout.trim();
  if (!stdout) {
    throw new Error(
      `eas-cli workflow:run produced no JSON output (exit code ${String(result.status)})`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch (cause) {
    throw new Error(`eas-cli workflow:run produced invalid JSON output: ${stdout}`, { cause });
  }

  if (!isRecord(parsed)) {
    throw new Error(`eas-cli workflow:run produced a non-object JSON payload: ${stdout}`);
  }

  return parsed;
}

function main(): void {
  let options: CliOptions;
  try {
    options = parseCliArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return;
  }

  console.log(
    `Starting EAS e2e workflow for platform "${options.platform}" (flows: ${options.flows})…`,
  );
  const run = runEasWorkflow(options);
  const { exitCode, message } = mapRunResult(run);
  console.log(message);
  process.exitCode = exitCode;
}

const isMainModule = import.meta.url === `file://${process.argv[1] ?? ''}`;
if (isMainModule) {
  main();
}
