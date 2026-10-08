import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';
import { parse } from 'yaml';

import {
  DEPLOY_CONFIG,
  GATES,
  suitesFor,
  type ChangedFile,
  type DryRun,
  type Suites,
} from './ci-affected-suites';

/**
 * The CI workflow's own contract: the one required check waits for every job and fails with any of
 * them, and the gates that spare runners never skip a suite the change can reach.
 */
interface Workflow {
  jobs: Record<
    string,
    {
      if?: string;
      needs?: string[];
      outputs?: Record<string, string>;
      steps?: {
        id?: string;
        uses?: string;
        run?: string;
        env?: Record<string, string>;
        with?: { filter?: string; 'fetch-depth'?: number };
      }[];
    }
  >;
}

const workflow = parse(
  readFileSync(path.resolve(import.meta.dirname, '../../.github/workflows/ci.yml'), 'utf8'),
) as Workflow;

describe('ci passed', () => {
  const gate = workflow.jobs['ci-passed'];
  const check = gate?.steps?.[0];

  /** The gate's own script, given the results GitHub hands it (`toJSON(needs.*.result)`). */
  function exitCode(results: readonly string[]): number | null {
    return spawnSync('bash', ['-e', '-c', check?.run ?? 'exit 2'], {
      env: { ...process.env, RESULTS: JSON.stringify(results, null, 2) },
    }).status;
  }

  it('needs every other job, so none can fail without failing the required check', () => {
    const others = Object.keys(workflow.jobs).filter((job) => job !== 'ci-passed');
    expect([...(gate?.needs ?? [])].sort()).toEqual(others.sort());
  });

  it('runs whatever the other jobs did, on the result of each', () => {
    // Without `always()` a failed job would skip the gate, and a skipped required check passes.
    expect(gate?.if).toBe('always()');
    expect(check?.env?.RESULTS).toBe('${{ toJSON(needs.*.result) }}');
  });

  it('fails when any one job failed or was cancelled: a Jest shard, a database leg', () => {
    // A matrix job reports one result: failure as soon as one of its legs failed.
    expect(exitCode(['success', 'failure', 'success', 'skipped'])).toBe(1);
    expect(exitCode(['success', 'success', 'cancelled'])).toBe(1);
  });

  it('passes when every job passed or was skipped by its filter', () => {
    expect(exitCode(['success', 'skipped', 'success', 'skipped'])).toBe(0);
    expect(exitCode(['success'])).toBe(0);
  });
});

describe('secret scan', () => {
  const steps = workflow.jobs.secrets?.steps ?? [];

  it("downloads no branch's files beyond its own checkout", () => {
    // Without the filter, `fetch-depth: 0` pulls every branch with its files: minutes per run.
    const checkout = steps.find((step) => step.uses?.startsWith('actions/checkout@'));
    expect(checkout?.with).toEqual({ 'fetch-depth': 0, filter: 'blob:none' });
  });

  it('scans the commits of the pull request or of the push, never all of history', () => {
    const range = steps.find((step) => step.env?.LOG_OPTS !== undefined)?.env?.LOG_OPTS ?? '';
    expect(range).toContain("format('origin/{0}..{1}', github.base_ref,");
    expect(range).toContain("format('{0}..{1}', github.event.before, github.sha)");
  });
});

describe('suites a change reaches', { timeout: 60_000 }, () => {
  const repoRoot = path.resolve(import.meta.dirname, '../..');
  let dryRun: DryRun;

  beforeAll(() => {
    // The dry run the changes job feeds the script, on this checkout.
    const result = spawnSync(
      'pnpm',
      ['turbo', 'run', 'test', 'test:db', 'build', '--dry-run=json'],
      {
        cwd: repoRoot,
        encoding: 'utf8',
        maxBuffer: 256 * 1024 * 1024,
      },
    );
    dryRun = JSON.parse(result.stdout) as DryRun;
  });

  /** Files as a diff lists them. They must exist here: turbo lists only real files as inputs. */
  function changed(...files: string[]): ChangedFile[] {
    return files.map((file) => {
      expect(existsSync(path.join(repoRoot, file)), `${file} exists`).toBe(true);
      return { path: file, exists: true };
    });
  }
  const legs = (suites: Suites) => suites.databaseLegs.map((leg) => leg.suite);
  const everyLeg = ['api', 'worker', 'db 1/3', 'db 2/3', 'db 3/3', 'other packages'];

  const screen = 'apps/mobile/src/app/_layout.tsx';
  const catalogs = ['packages/i18n/locales/en/album.po', 'packages/i18n/locales/vi/album.ts'];
  const iosSource = 'apps/mobile/modules/cp-haptics/ios/CpHapticsModule.swift';

  it('starts only the app suites for a screen and its catalogs', () => {
    const suites = suitesFor(dryRun, changed(screen, 'e2e/README.md', ...catalogs));
    expect(suites.flags.app_tests).toBe(true);
    // The app's own database suites; no server leg, although the worker depends on @cp/i18n.
    expect(legs(suites)).toEqual(['other packages']);
    expect(legs(suitesFor(dryRun, changed(...catalogs)))).toEqual(['other packages']);
    expect(suitesFor(dryRun, changed(screen)).flags.app_tests).toBe(true);
  });

  it('starts only the legs that build on a server package, and no app shard', () => {
    const api = suitesFor(dryRun, changed('services/api/src/routes/actions.ts', 'docs/README.md'));
    expect(api.flags.app_tests).toBe(false);
    // The app's database suites start the api's own harness, so they follow a server leg.
    expect(legs(api)).toEqual(['api', 'other packages']);
    expect(api.databaseLegs.at(-1)?.tasks).toBe('@cp/mobile#test:db');

    const worker = suitesFor(
      dryRun,
      changed('services/worker/test/account/export-build.db.test.ts'),
    );
    expect(legs(worker)).toEqual(['worker', 'other packages']);
    expect(worker.databaseLegs[0]).toMatchObject({ tasks: '@cp/worker#test:db', ffmpeg: true });

    const db = suitesFor(
      dryRun,
      changed('packages/db/migrations/20260926212754_core_roles_and_schemas.sql'),
    );
    expect(db.flags.app_tests).toBe(false);
    expect(legs(db)).toEqual(everyLeg);
    expect(db.databaseLegs[2]).toMatchObject({ tasks: '@cp/db#test', args: '-- --shard=1/3' });
  });

  it('runs every suite for a file turbo hashes into every task, or when the base is unknown', () => {
    for (const file of [
      'pnpm-lock.yaml',
      'turbo.json',
      'package.json',
      '.github/workflows/ci.yml',
    ]) {
      const suites = suitesFor(dryRun, changed(file));
      expect(suites.flags.app_tests, file).toBe(true);
      expect(suites.flags.service_images, file).toBe(true);
      expect(legs(suites), file).toEqual(everyLeg);
    }
    const unknown = suitesFor(dryRun, null);
    // Both native compiles run, which leaves the fingerprint job nothing to decide.
    const { native_fingerprint: _decided, ...flags } = unknown.flags;
    expect(Object.values(flags).every(Boolean)).toBe(true);
    expect(legs(unknown)).toEqual(everyLeg);
  });

  it('counts a deleted file for the package it sat in', () => {
    const suites = suitesFor(dryRun, [{ path: 'packages/domain/src/removed.ts', exists: false }]);
    expect(suites.flags.app_tests).toBe(true);
    expect(legs(suites)).toEqual(everyLeg);
  });

  it('runs the database suites for the infra files they read, not for deploy configuration', () => {
    for (const file of [
      'infra/docker/postgres/Dockerfile',
      'infra/centrifugo/config.json',
      'infra/powersync/sync-streams.yaml',
    ]) {
      expect(legs(suitesFor(dryRun, changed(file))), file).toEqual(everyLeg);
    }
    const dashboards = suitesFor(dryRun, changed('infra/monitoring/posthog/insights.json'));
    expect(legs(dashboards)).toEqual([]);
    expect(dashboards.flags.app_tests).toBe(false);
    expect(GATES.app_tests.ignore).toEqual(DEPLOY_CONFIG);
  });

  /** A workspace package's folder and those of every workspace package it depends on. */
  function folders(name: string, seen = new Set<string>()): string[] {
    const packages = ['apps', 'services', 'packages', 'tools'].flatMap((group) =>
      readdirSync(path.join(repoRoot, group))
        .map((dir) => `${group}/${dir}`)
        .filter((dir) => existsSync(path.join(repoRoot, dir, 'package.json'))),
    );
    const manifests = new Map(
      packages.map((dir) => {
        const manifest = JSON.parse(
          readFileSync(path.join(repoRoot, dir, 'package.json'), 'utf8'),
        ) as { name: string; dependencies?: object; devDependencies?: object };
        return [manifest.name, { dir, manifest }] as const;
      }),
    );
    const found = manifests.get(name);
    if (found === undefined || seen.has(name)) return [];
    seen.add(name);
    const deps = Object.keys({ ...found.manifest.dependencies, ...found.manifest.devDependencies });
    return [found.dir, ...deps.flatMap((dep) => folders(dep, seen))];
  }

  it('never keeps a suite from a change turbo would run it for', () => {
    // Turbo's --affected runs a package's tasks for a change in its folder or in a package it
    // depends on: each of those must open the suite's gate too.
    const suiteOf = { '@cp/api': 'api', '@cp/worker': 'worker' };
    for (const [name, leg] of Object.entries(suiteOf)) {
      for (const dir of folders(name)) {
        const suites = suitesFor(dryRun, changed(`${dir}/package.json`));
        expect(legs(suites), `${name} builds on ${dir}`).toContain(leg);
      }
    }
    // @cp/db's suite follows its own folder and domain's source (the next case).
    expect(folders('@cp/db')).toEqual(['packages/db', 'packages/domain']);
    expect(legs(suitesFor(dryRun, changed('packages/db/package.json')))).toContain('db 1/3');
    for (const dir of folders('@cp/mobile')) {
      const suites = suitesFor(dryRun, changed(`${dir}/package.json`));
      expect(suites.flags.app_tests, `the app builds on ${dir}`).toBe(true);
      expect(legs(suites), `the app builds on ${dir}`).toContain('other packages');
    }
    // The deploy configuration the gates ignore holds packages of its own: none of them may be
    // one a gated suite builds on.
    for (const name of ['@cp/api', '@cp/worker', '@cp/db', '@cp/mobile']) {
      expect(folders(name).filter((dir) => dir.startsWith('infra/'))).toEqual([]);
    }
  });

  it("runs @cp/db's suite for any domain source, not for domain's own tests", () => {
    // The suite imports domain values throughout (privacy classes, the statuses its constraints
    // mirror, poll, purge and realtime rules), so every source file of domain counts.
    for (const file of ['packages/domain/src/privacy.ts', 'packages/domain/src/money/index.ts']) {
      expect(legs(suitesFor(dryRun, changed(file))), file).toEqual(everyLeg);
    }
    const tests = suitesFor(dryRun, [
      ...changed(
        'packages/domain/test/errors.test.ts',
        'packages/domain/src/paywall/governor.test.ts',
        'packages/domain/src/links/__tests__/grammar.test.ts',
      ),
      { path: 'packages/domain/src/removed.test.ts', exists: false },
    ]);
    // The api and the worker still build on the whole package.
    expect(legs(tests)).toEqual(['api', 'worker', 'other packages']);
  });

  it('compiles natively for native sources and leaves everything else to the fingerprint', () => {
    const plugin = suitesFor(dryRun, changed('apps/mobile/plugins/with-links.ts')).flags;
    // Both compiles run, so there is nothing left for the fingerprint job to decide.
    expect(plugin).toMatchObject({ ios_native: true, android_native: true });
    expect(plugin.native_fingerprint).toBe(false);

    const swift = suitesFor(dryRun, changed(iosSource)).flags;
    expect(swift).toMatchObject({ ios_native: true, android_native: false });
    expect(swift.native_fingerprint).toBe(true);

    // What can move the fingerprint without touching native sources: a dependency, a token the
    // app config reads. No compile on the paths alone.
    for (const files of [
      ['pnpm-lock.yaml', 'pnpm-workspace.yaml', 'services/api/package.json'],
      ['apps/mobile/package.json'],
      ['packages/design-tokens/src/color.tokens.json'],
      ['patches/@op-engineering__op-sqlite.patch'],
    ]) {
      const flags = suitesFor(dryRun, changed(...files)).flags;
      expect(flags, files.join(' ')).toMatchObject({ ios_native: false, android_native: false });
      expect(flags.native_fingerprint, files.join(' ')).toBe(true);
    }
    // The app's JS, its copy and server code cannot move it.
    const js = suitesFor(
      dryRun,
      changed(screen, ...catalogs, 'services/api/src/routes/actions.ts'),
    );
    expect(js.flags.native_fingerprint).toBe(false);
  });

  it('runs a compile on either answer, and after a skipped fingerprint job', () => {
    for (const platform of ['ios', 'android']) {
      const job = workflow.jobs[`${platform}-native`];
      expect(job?.needs).toEqual(['changes', 'native-fingerprint']);
      expect(job?.if).toBe(
        `\${{ !cancelled() && (needs.changes.outputs.${platform}_native == 'true' || needs.native-fingerprint.outputs.${platform} == 'true') }}`,
      );
    }
  });

  it('gives every gate an output, and every job a flag that exists', () => {
    // A misspelt output reads as empty, and a job gated on it would be skipped without a word.
    const text = readFileSync(path.join(repoRoot, '.github/workflows/ci.yml'), 'utf8');
    const outputs = Object.keys(workflow.jobs.changes?.outputs ?? {});
    expect([...outputs].sort()).toEqual([...Object.keys(GATES), 'database_legs'].sort());
    for (const output of outputs) {
      expect(workflow.jobs.changes?.outputs?.[output]).toBe(
        `\${{ steps.suites.outputs.${output} }}`,
      );
    }
    const read = [...text.matchAll(/needs\.changes\.outputs\.(\w+)/g)].map((match) => match[1]);
    expect(new Set(read)).toEqual(new Set(outputs));
  });
});
