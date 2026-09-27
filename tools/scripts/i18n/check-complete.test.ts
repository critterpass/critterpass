import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { describeFinding, findFindings } from './check-complete.js';

const fixturesDir = join(import.meta.dirname, 'fixtures');
const incomplete = {
  localesDir: join(fixturesDir, 'incomplete', 'locales'),
  registryPath: join(fixturesDir, 'incomplete', 'locales.json'),
};
const complete = {
  localesDir: join(fixturesDir, 'complete', 'locales'),
  registryPath: join(fixturesDir, 'complete', 'locales.json'),
};

describe('findFindings', () => {
  it('flags a shipped locale missing a translation the source catalog has', () => {
    const findings = findFindings(incomplete);
    expect(findings).toEqual([
      { kind: 'missing', locale: 'vi', catalog: 'common', id: 'common.cancel.label' },
    ]);
  });

  it('finds nothing for fully translated shipped locales', () => {
    expect(findFindings(complete)).toEqual([]);
  });

  it('never checks a locale that is registered but not shipped', () => {
    // Both fixtures register "de" as shipped: false with no locales/de directory at all; a
    // registered-but-unshipped locale must never produce a finding.
    for (const findings of [findFindings(incomplete), findFindings(complete)]) {
      expect(findings.some((finding) => finding.locale === 'de')).toBe(false);
    }
  });

  it('flags broken ICU syntax in a translation', () => {
    const findings = findFindings({
      localesDir: join(fixturesDir, 'broken-icu', 'locales'),
      registryPath: join(fixturesDir, 'broken-icu', 'locales.json'),
    });
    expect(findings).toHaveLength(1);
    const [finding] = findings;
    expect(finding).toMatchObject({
      kind: 'broken-icu',
      locale: 'vi',
      catalog: 'common',
      id: 'trip.itemCount.label',
    });
    expect(finding?.detail).toMatch(/unbalanced braces/);
  });
});

describe('describeFinding', () => {
  it('describes a missing translation', () => {
    expect(describeFinding({ kind: 'missing', locale: 'vi', catalog: 'common', id: 'a.b.c' })).toBe(
      'missing translation: vi/common.po "a.b.c"',
    );
  });

  it('describes broken ICU with its reason', () => {
    expect(
      describeFinding({
        kind: 'broken-icu',
        locale: 'vi',
        catalog: 'common',
        id: 'a.b.c',
        detail: 'unbalanced braces (missing 1 closing "}")',
      }),
    ).toBe('broken ICU (unbalanced braces (missing 1 closing "}")): vi/common.po "a.b.c"');
  });
});

describe('CLI', () => {
  const scriptPath = join(import.meta.dirname, 'check-complete.ts');

  function run(args: string[]): { status: number; stdout: string } {
    try {
      const stdout = execFileSync('pnpm', ['exec', 'tsx', scriptPath, ...args], {
        encoding: 'utf8',
      });
      return { status: 0, stdout };
    } catch (error) {
      const withStatus = error as { status: number | null; stdout: string };
      return { status: withStatus.status ?? 1, stdout: withStatus.stdout };
    }
  }

  it('--mode warn exits 0 with an annotation on an incomplete fixture', () => {
    const result = run(['--dry', '--mode', 'warn']);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('::warning::missing translation');
  });

  it('--mode release fails on a fixture with a missing vi key', () => {
    const result = run(['--dry', '--mode', 'release']);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain(
      '::error::missing translation: vi/common.po "common.cancel.label"',
    );
  });

  it('both modes pass on complete catalogs', () => {
    const localesDir = complete.localesDir;
    const registryPath = complete.registryPath;
    for (const mode of ['warn', 'release']) {
      const result = run(['--mode', mode, '--locales-dir', localesDir, '--registry', registryPath]);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('no missing translations or broken ICU');
    }
  });
});
