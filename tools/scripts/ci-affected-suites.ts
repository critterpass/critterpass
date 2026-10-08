import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import gates from './ci-suite-gates.json' with { type: 'json' };

/**
 * Which suites of `.github/workflows/ci.yml` a change can reach: the one answer every gated job
 * reads, so a job that has nothing to run never starts a runner.
 *
 *   turbo run test test:db build --dry-run=json > tasks.json
 *   TURBO_SCM_BASE=origin/main node tools/scripts/ci-affected-suites.ts tasks.json
 *
 * The dry run lists every task with the files turbo hashes for it and the tasks it depends on, so
 * a task counts as reached exactly when its hash would change: one of its input files is in the
 * diff, a task it depends on is reached, or a file every hash includes changed. `inputs` and
 * `dependsOn` in turbo.json therefore steer the gates as they steer the cache. Suites that are not
 * a turbo task (image builds, Playwright, native compiles) add the path lists of
 * ci-suite-gates.json.
 *
 * Runs before `pnpm install`, on Node's own TypeScript support: Node built-ins and JSON only.
 */

export interface DryRunTask {
  taskId: string;
  task: string;
  command: string;
  /** The package's folder, from the repo root. */
  directory: string;
  /** Hashed files, relative to {@link directory} (`../../infra/x` for a root input). */
  inputs: Record<string, string>;
  /** Task ids this task's hash includes. */
  dependencies: string[];
  resolvedTaskDefinition: { inputs?: string[] | null };
}

export interface DryRun {
  globalCacheInputs: { files: Record<string, string> };
  tasks: DryRunTask[];
}

export interface ChangedFile {
  path: string;
  /** False for a file the change deleted (or renamed away): no task lists it any more. */
  exists: boolean;
}

/** Files turbo hashes into every task on its own; turbo.json's globalDependencies come from the dry run. */
const ALWAYS_GLOBAL = ['package.json', 'pnpm-lock.yaml', 'turbo.json'];

/** `**` crosses folders, `*` stays inside one; dotfiles match like any other name. */
export function matchesGlob(file: string, glob: string): boolean {
  const source = glob
    .split(/(\*\*|\*)/)
    .map((part) =>
      part === '**' ? '.*' : part === '*' ? '[^/]*' : part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'),
    )
    .join('');
  return new RegExp(`^${source}$`).test(file);
}

function isInput(task: DryRunTask, file: ChangedFile): boolean {
  if (Object.hasOwn(task.inputs, path.posix.relative(task.directory, file.path))) return true;
  if (file.exists) return false;
  // A deleted file is in no input list. It counts for every task of the package it sat in, and
  // for the tasks whose root inputs (`$TURBO_ROOT$/infra/**`) cover its old path.
  if (file.path.startsWith(`${task.directory}/`)) return true;
  const globs = task.resolvedTaskDefinition.inputs ?? [];
  const covers = (glob: string) =>
    matchesGlob(file.path, path.posix.join(task.directory, glob.replace(/^!/, '')));
  return (
    globs.some((glob) => glob.startsWith('../') && covers(glob)) &&
    !globs.some((glob) => glob.startsWith('!') && covers(glob))
  );
}

/** Every task whose hash the change moves, with the file (or task) that moves it. */
export function affectedTasks(
  dryRun: DryRun,
  changed: readonly ChangedFile[],
): Map<string, string> {
  const globals = new Set([...ALWAYS_GLOBAL, ...Object.keys(dryRun.globalCacheInputs.files)]);
  const global = changed.find((file) => globals.has(file.path));
  const reasons = new Map<string, string>();
  for (const task of dryRun.tasks) {
    const hit = global ?? changed.find((file) => isInput(task, file));
    if (hit !== undefined) reasons.set(task.taskId, hit.path);
  }
  for (let grew = true; grew;) {
    grew = false;
    for (const task of dryRun.tasks) {
      if (reasons.has(task.taskId)) continue;
      const dependency = task.dependencies.find((id) => reasons.has(id));
      if (dependency === undefined) continue;
      reasons.set(task.taskId, `${dependency} <- ${reasons.get(dependency) ?? ''}`);
      grew = true;
    }
  }
  return reasons;
}

/**
 * Message catalogs. Nearly every app change touches them, the worker depends on @cp/i18n, and no
 * database suite or image build reads one (the unit tests cover the server's strings), so the
 * server's legs and gates look at the change without them.
 */
export const CATALOGS = 'packages/i18n/locales/**';

/**
 * Deploy and dashboard configuration under infra/. Turbo hashes all of infra/ into every test task
 * (the suites read the Postgres image, the Centrifugo config and the sync rules from there), but
 * no app or database suite reads these three folders: their own packages and the scripts that
 * apply them are tested in the checks job.
 */
export const DEPLOY_CONFIG = ['infra/cloudflare/**', 'infra/monitoring/**', 'infra/railway/**'];

interface Gate {
  /** What the gate guards, for whoever edits the list. */
  why: string;
  /** Turbo tasks: the gate opens when the change reaches any of them. */
  tasks?: readonly string[];
  /** Paths outside turbo's view of those tasks. */
  paths?: readonly string[];
  /** Changed files this gate does not look at. */
  ignore?: readonly string[];
}

export type GateName = keyof typeof gates;

/** One gate per job-level `if` of ci.yml; the key is the output's name. */
export const GATES: Record<GateName, Gate> = gates;

/** @cp/db's suite starts a Postgres per file, one file at a time: three runners take a third each. */
const DB_SHARDS = 3;

export interface DatabaseLeg {
  suite: string;
  /** Turbo task ids, space separated. */
  tasks: string;
  /** Arguments for the test runner, after turbo's `--`; part of the task hash. */
  args: string;
  /** The worker's media and voice-note suites run the real ffmpeg. */
  ffmpeg: boolean;
}

export interface Suites {
  flags: Record<GateName, boolean>;
  /** The matrix of the database job: only the legs with something to run. */
  databaseLegs: DatabaseLeg[];
  /** Why each open gate and leg is open, for the job log. */
  reasons: Record<string, string>;
}

/**
 * The gates and database legs for a change. `changed: null` means the diff is unknown (the base
 * commit is not in the clone): everything runs.
 */
export function suitesFor(dryRun: DryRun, changed: readonly ChangedFile[] | null): Suites {
  const everything = changed === null;
  const files = changed ?? [];
  const all = affectedTasks(dryRun, files);
  const reasons: Record<string, string> = {};

  const flags = {} as Suites['flags'];
  for (const [name, gate] of Object.entries(GATES) as [GateName, Gate][]) {
    const ignore = gate.ignore;
    const seen =
      ignore === undefined
        ? files
        : files.filter((file) => !ignore.some((glob) => matchesGlob(file.path, glob)));
    const reached = ignore === undefined ? all : affectedTasks(dryRun, seen);
    const task = (gate.tasks ?? []).find((id) => reached.has(id));
    const file = seen.find((candidate) =>
      (gate.paths ?? []).some((glob) => matchesGlob(candidate.path, glob)),
    );
    const reason = everything
      ? 'the base commit is unknown'
      : task !== undefined
        ? `${task} <- ${reached.get(task) ?? ''}`
        : file?.path;
    flags[name] = reason !== undefined;
    if (reason !== undefined) reasons[name] = reason;
  }
  // Both compiles already run: nothing left for the fingerprint to decide.
  if (flags.ios_native && flags.android_native) flags.native_fingerprint = false;

  const without = (globs: readonly string[]) =>
    affectedTasks(
      dryRun,
      files.filter((file) => !globs.some((glob) => matchesGlob(file.path, glob))),
    );
  const database = without(DEPLOY_CONFIG);
  const server = without([CATALOGS, ...DEPLOY_CONFIG]);
  const reaches = (tasks: Map<string, string>, id: string) => everything || tasks.has(id);
  const databaseLegs: DatabaseLeg[] = [];
  const api = reaches(server, '@cp/api#test:db');
  const worker = reaches(server, '@cp/worker#test:db');
  if (api) {
    databaseLegs.push({
      suite: 'api',
      tasks: '@cp/api#test:db',
      args: '',
      ffmpeg: false,
    });
  }
  if (worker) {
    databaseLegs.push({
      suite: 'worker',
      tasks: '@cp/worker#test:db',
      args: '',
      ffmpeg: true,
    });
  }
  // @cp/db's own suite is its `test` script.
  if (reaches(database, '@cp/db#test')) {
    for (let shard = 1; shard <= DB_SHARDS; shard += 1) {
      databaseLegs.push({
        suite: `db ${shard}/${DB_SHARDS}`,
        tasks: '@cp/db#test',
        args: `-- --shard=${shard}/${DB_SHARDS}`,
        ffmpeg: false,
      });
    }
  }
  // Every other package with a test:db script (the app's suites today), so a package that gains
  // the script runs here without a new leg. The app's database suites start the api's own test
  // harness by its path, which turbo does not see, so they also run whenever a server leg does.
  const others = dryRun.tasks
    .filter((task) => task.task === 'test:db' && task.command !== '<NONEXISTENT>')
    .map((task) => task.taskId)
    .filter((id) => id !== '@cp/api#test:db' && id !== '@cp/worker#test:db')
    .filter((id) => reaches(database, id) || (id === '@cp/mobile#test:db' && (api || worker)));
  if (others.length > 0) {
    databaseLegs.push({
      suite: 'other packages',
      tasks: others.join(' '),
      args: '',
      ffmpeg: false,
    });
  }
  for (const leg of databaseLegs) {
    const [first = ''] = leg.tasks.split(' ');
    reasons[`database (${leg.suite})`] = everything
      ? 'the base commit is unknown'
      : (server.get(first) ?? database.get(first) ?? 'a server leg runs');
  }
  return { flags, databaseLegs, reasons };
}

/** The files between the base and the checked-out commit; null when git cannot tell. */
function changedFiles(base: string): ChangedFile[] | null {
  try {
    // --no-renames: both names of a moved file, and no file contents (the clone has none).
    const names = execFileSync('git', ['diff', '--name-only', '--no-renames', `${base}...HEAD`], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    return names
      .split('\n')
      .filter((name) => name !== '')
      .map((name) => ({ path: name, exists: existsSync(name) }));
  } catch {
    return null;
  }
}

function main(): void {
  const [dryRunPath] = process.argv.slice(2);
  const base = process.env.TURBO_SCM_BASE;
  if (dryRunPath === undefined || base === undefined || base === '') {
    throw new Error('usage: TURBO_SCM_BASE=<ref> ci-affected-suites.ts <turbo dry-run json>');
  }
  const dryRun = JSON.parse(readFileSync(dryRunPath, 'utf8')) as DryRun;
  if (!Array.isArray(dryRun.tasks) || dryRun.tasks.length === 0) {
    throw new Error('the turbo dry run lists no task');
  }
  const changed = changedFiles(base);
  const { flags, databaseLegs, reasons } = suitesFor(dryRun, changed);

  console.log(
    changed === null
      ? `No diff with ${base}: every suite runs.`
      : `${changed.length} changed files against ${base}.`,
  );
  for (const [name, on] of Object.entries(flags)) {
    console.log(`${on ? 'run ' : 'skip'}  ${name}${on ? `  (${reasons[name] ?? ''})` : ''}`);
  }
  for (const leg of databaseLegs) {
    console.log(`run   database (${leg.suite})  (${reasons[`database (${leg.suite})`] ?? ''})`);
  }
  if (databaseLegs.length === 0) console.log('skip  database');

  const output = process.env.GITHUB_OUTPUT;
  if (output === undefined) return;
  const lines = Object.entries(flags).map(([name, on]) => `${name}=${String(on)}`);
  lines.push(`database_legs=${JSON.stringify(databaseLegs)}`);
  appendFileSync(output, `${lines.join('\n')}\n`);
}

if (
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
) {
  main();
}
