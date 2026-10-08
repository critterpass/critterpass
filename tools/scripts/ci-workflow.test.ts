import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

/**
 * The CI workflow's own contract: the one required check waits for every job and fails with any of
 * them, and the path filters that spare runners never skip a suite the change can reach.
 */
interface Workflow {
  jobs: Record<
    string,
    {
      if?: string;
      needs?: string[];
      strategy?: { matrix: { include?: { filter: string; server?: boolean }[] } };
      steps?: {
        id?: string;
        uses?: string;
        run?: string;
        env?: Record<string, string>;
        with?: { filters?: string; filter?: string; 'fetch-depth'?: number };
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

describe('suite filters of the changes job', () => {
  const step = workflow.jobs.changes?.steps?.find((candidate) => candidate.id === 'suites');
  const filters = parse(step?.with?.filters ?? '') as Record<string, unknown[]>;

  /** dorny/paths-filter's `some-with-excludes`: a file counts when a pattern matches it and no `!` pattern does. */
  function reaches(filter: string, files: readonly string[]): boolean {
    const patterns = (filters[filter] ?? []).flat(Infinity) as string[];
    const excluded = patterns.filter((p) => p.startsWith('!')).map((p) => p.slice(1));
    const included = patterns.filter((p) => !p.startsWith('!'));
    const matches = (file: string, list: readonly string[]) =>
      list.some((pattern) => path.matchesGlob(file, pattern));
    return files.some((file) => matches(file, included) && !matches(file, excluded));
  }

  const app = ['apps/mobile/src/features/explore/place.tsx', 'e2e/explore/place.yaml'];
  const catalogs = ['packages/i18n/locales/en/explore.po', 'packages/i18n/locales/vi/explore.ts'];

  it('skips the api and worker database suites when only catalogs changed under packages', () => {
    expect(reaches('server', [...app, ...catalogs])).toBe(false);
    expect(reaches('server', catalogs)).toBe(false);
  });

  it('runs them for anything else a server suite can depend on', () => {
    for (const file of [
      'packages/domain/src/explore/wire.ts',
      'packages/i18n/src/index.ts',
      'packages/db/migrations/20261001000000_places.sql',
      'services/api/src/routes/explore.ts',
      'services/worker/test/notify-release.db.test.ts',
      'infra/docker/postgres/Dockerfile',
      'pnpm-lock.yaml',
      'turbo.json',
      '.github/workflows/ci.yml',
    ]) {
      expect(reaches('server', [...app, ...catalogs, file]), file).toBe(true);
    }
  });

  /** A workspace package's folder and those of every workspace package it depends on. */
  function folders(name: string, seen = new Set<string>()): string[] {
    const repoRoot = path.resolve(import.meta.dirname, '../..');
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
    // The filters only spare runners: every package a gated suite builds on must pass its filter.
    const legs = (workflow.jobs.database?.strategy?.matrix.include ?? []).filter(
      (leg) => leg.server === true,
    );
    const gated = legs.map((leg) => /--filter=(@cp\/[\w-]+)/.exec(leg.filter)?.[1] ?? '');
    expect(new Set(gated)).toEqual(new Set(['@cp/api', '@cp/worker', '@cp/db']));
    for (const name of new Set(gated)) {
      for (const dir of folders(name)) {
        expect(reaches('server', [`${dir}/src/index.ts`]), `${name} builds on ${dir}`).toBe(true);
      }
    }
    for (const dir of folders('@cp/mobile')) {
      expect(reaches('app', [`${dir}/src/index.ts`]), `the app builds on ${dir}`).toBe(true);
    }
  });

  it('starts the app tests for the app, its catalogs and every package, not for server code', () => {
    expect(reaches('app', app)).toBe(true);
    expect(reaches('app', catalogs)).toBe(true);
    expect(reaches('app', ['packages/domain/src/explore/wire.ts'])).toBe(true);
    expect(reaches('app', ['pnpm-lock.yaml'])).toBe(true);
    expect(reaches('app', ['services/api/src/routes/explore.ts', 'docs/README.md'])).toBe(false);
  });
});
