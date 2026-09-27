import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { locatePulledFiles } from './tolgee-pull';

describe('locatePulledFiles', () => {
  let workDir: string;

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it('maps each locale-directory .po file to its (locale, catalog) pair', () => {
    workDir = mkdtempSync(join(tmpdir(), 'cp-tolgee-pull-test-'));
    mkdirSync(join(workDir, 'vi'), { recursive: true });
    mkdirSync(join(workDir, 'ja'), { recursive: true });
    writeFileSync(join(workDir, 'vi', 'common.po'), 'msgid ""\nmsgstr ""\n');
    writeFileSync(join(workDir, 'ja', 'common.po'), 'msgid ""\nmsgstr ""\n');
    writeFileSync(join(workDir, 'vi', 'onboarding.po'), 'msgid ""\nmsgstr ""\n');

    const files = locatePulledFiles(workDir);
    expect(files.map((f) => `${f.locale}/${f.catalog}`).sort()).toEqual([
      'ja/common',
      'vi/common',
      'vi/onboarding',
    ]);
  });

  it('ignores non-.po files and non-directory entries at the top level', () => {
    workDir = mkdtempSync(join(tmpdir(), 'cp-tolgee-pull-test-'));
    mkdirSync(join(workDir, 'vi'), { recursive: true });
    writeFileSync(join(workDir, 'vi', 'common.po'), 'msgid ""\nmsgstr ""\n');
    writeFileSync(join(workDir, 'vi', 'readme.txt'), 'not a catalog');
    writeFileSync(join(workDir, 'manifest.json'), '{}');

    expect(locatePulledFiles(workDir)).toHaveLength(1);
  });
});
