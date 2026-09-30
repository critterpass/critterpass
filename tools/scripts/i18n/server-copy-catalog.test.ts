/**
 * Every push and email template the server renders must be a catalog message: a template id that
 * is missing from `notifications/*` renders in English for every locale. Scans the server sources
 * for `notifications.*` and `email.*` template ids and checks the source-locale catalogs hold them.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { readPoEntries } from './po-catalog';

const repoRoot = path.resolve(import.meta.dirname, '../../..');
const SERVER_SOURCES = ['packages/domain/src', 'services/worker/src'];
const TEMPLATE_ID = /\bid: '((?:notifications|email)\.[a-z0-9_.]+[a-z0-9_])'/giu;

function templateIds(): Set<string> {
  const files = execFileSync('git', ['ls-files', '--', ...SERVER_SOURCES], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
    .split('\n')
    .filter(
      (file) => file.endsWith('.ts') && !file.includes('.test.') && !file.includes('__tests__'),
    );
  const ids = new Set<string>();
  for (const file of files) {
    const text = readFileSync(path.join(repoRoot, file), 'utf8');
    for (const match of text.matchAll(TEMPLATE_ID)) if (match[1]) ids.add(match[1]);
  }
  return ids;
}

function catalogIds(): Set<string> {
  const ids = new Set<string>();
  for (const name of ['common', 'roundup']) {
    const file = path.join(repoRoot, `packages/i18n/locales/en/notifications/${name}.po`);
    for (const entry of readPoEntries(readFileSync(file, 'utf8'))) ids.add(entry.id);
  }
  return ids;
}

describe('server copy catalogs', () => {
  it('holds every push and email template the server renders', () => {
    const inCatalog = catalogIds();
    const ids = [...templateIds()];
    expect(ids.length).toBeGreaterThan(50);
    expect(ids.filter((id) => !inCatalog.has(id))).toEqual([]);
  });
});
