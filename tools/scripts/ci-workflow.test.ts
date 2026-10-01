import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

/**
 * The CI workflow's own contract: the one required check waits for every job, and the path
 * filters that spare runners never skip a suite the change can reach.
 */
interface Workflow {
  jobs: Record<
    string,
    { needs?: string[]; steps?: { id?: string; with?: { filters?: string } }[] }
  >;
}

const workflow = parse(
  readFileSync(path.resolve(import.meta.dirname, '../../.github/workflows/ci.yml'), 'utf8'),
) as Workflow;

describe('ci passed', () => {
  it('needs every other job, so none can fail without failing the required check', () => {
    const others = Object.keys(workflow.jobs).filter((job) => job !== 'ci-passed');
    expect([...(workflow.jobs['ci-passed']?.needs ?? [])].sort()).toEqual(others.sort());
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

  it('starts the app tests for the app, its catalogs and every package, not for server code', () => {
    expect(reaches('app', app)).toBe(true);
    expect(reaches('app', catalogs)).toBe(true);
    expect(reaches('app', ['packages/domain/src/explore/wire.ts'])).toBe(true);
    expect(reaches('app', ['pnpm-lock.yaml'])).toBe(true);
    expect(reaches('app', ['services/api/src/routes/explore.ts', 'docs/README.md'])).toBe(false);
  });
});
