import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  decide,
  isUiChange,
  nextPage,
  pullRequestFiles,
  uiFilesBetween,
  type FilesPage,
} from './ui-review-gate';

describe('UI review gate', () => {
  it('counts screens, features and shared components, not their tests', () => {
    expect(isUiChange('apps/mobile/src/app/crew/new.tsx')).toBe(true);
    expect(isUiChange('apps/mobile/src/features/vote/showdown/showdown.tsx')).toBe(true);
    expect(isUiChange('apps/mobile/src/ui/shell/BackEyebrow.tsx')).toBe(true);
    expect(isUiChange('apps/mobile/src/ui/shell/__tests__/back.test.tsx')).toBe(false);
    expect(isUiChange('apps/mobile/src/features/vote/showdown.test.ts')).toBe(false);
    expect(isUiChange('apps/mobile/src/features/home/test-support/seed.ts')).toBe(false);
    expect(isUiChange('apps/mobile/src/app/__mocks__/mock-skia.tsx')).toBe(false);
    expect(isUiChange('apps/mobile/src/lib/links/route-map.ts')).toBe(false);
    expect(isUiChange('services/api/src/app/index.ts')).toBe(false);
  });

  it('passes a pull request with no UI change', () => {
    expect(decide({ changed: ['docs/README.md'], labelled: false }).pass).toBe(true);
  });

  it('fails a UI change until it is labelled', () => {
    const changed = ['apps/mobile/src/ui/text/Text.tsx'];
    const unreviewed = decide({ changed, labelled: false });
    expect(unreviewed.pass).toBe(false);
    expect(unreviewed.message).toContain('apps/mobile/src/ui/text/Text.tsx');
    expect(decide({ changed, labelled: true }).pass).toBe(true);
  });

  it('takes the label off when a push changes UI files after the review', () => {
    const changed = ['apps/mobile/src/ui/text/Text.tsx', 'docs/a.md'];
    const again = decide({ changed, labelled: true, pushed: ['apps/mobile/src/ui/text/Text.tsx'] });
    expect(again).toMatchObject({ pass: false, removeLabel: true });
    const docsOnly = decide({ changed, labelled: true, pushed: ['docs/a.md'] });
    expect(docsOnly).toMatchObject({ pass: true, removeLabel: false });
  });
});

describe("the pull request's files", () => {
  const file = (filename: string) => ({ filename, status: 'modified' });
  const quick = { attempts: 3, delayMs: 0 };

  /** A fake of the files endpoint: each URL answers with its queued pages, the last one for good. */
  function endpoint(pages: Record<string, FilesPage[]>) {
    const asked: string[] = [];
    const getPage = (url: string): Promise<FilesPage> => {
      asked.push(url);
      const queue = pages[url] ?? [];
      const page = queue.length > 1 ? queue.shift() : queue[0];
      return page ? Promise.resolve(page) : Promise.reject(new Error(`unexpected ${url}`));
    };
    return { asked, getPage };
  }

  it('reads every page, following each next link', async () => {
    const { asked, getPage } = endpoint({
      first: [{ body: [file('docs/a.md'), file('services/api/src/a.ts')], next: 'second' }],
      second: [{ body: [file('apps/mobile/src/ui/text/Text.tsx')], next: 'third' }],
      third: [{ body: [file('packages/domain/src/b.ts')] }],
    });
    expect(await pullRequestFiles('first', getPage, quick)).toEqual([
      'docs/a.md',
      'services/api/src/a.ts',
      'apps/mobile/src/ui/text/Text.tsx',
      'packages/domain/src/b.ts',
    ]);
    expect(asked).toEqual(['first', 'second', 'third']);
  });

  it('asks again for a page that came back without a list, and keeps what follows it', async () => {
    const { asked, getPage } = endpoint({
      first: [{ body: [file('docs/a.md')], next: 'second' }],
      second: [{ body: null }, { body: [file('apps/mobile/src/app/crew/new.tsx')] }],
    });
    expect(await pullRequestFiles('first', getPage, quick)).toEqual([
      'docs/a.md',
      'apps/mobile/src/app/crew/new.tsx',
    ]);
    expect(asked).toEqual(['first', 'second', 'second']);
  });

  it('fails rather than read a missing or empty page as no files', async () => {
    for (const body of [null, {}, []]) {
      const { asked, getPage } = endpoint({ first: [{ body }] });
      await expect(pullRequestFiles('first', getPage, quick)).rejects.toThrow(
        /of the pull request's files/,
      );
      expect(asked).toHaveLength(quick.attempts);
    }
  });

  it('asks again when the request itself fails', async () => {
    let calls = 0;
    const getPage = (): Promise<FilesPage> => {
      calls += 1;
      return calls === 1
        ? Promise.reject(new Error('GitHub answered 502'))
        : Promise.resolve({ body: [file('docs/a.md')] });
    };
    expect(await pullRequestFiles('first', getPage, quick)).toEqual(['docs/a.md']);
  });

  it('finds the next page in a Link header', () => {
    const link =
      '<https://api.github.com/repositories/1/pulls/274/files?per_page=100&page=2>; rel="next", ' +
      '<https://api.github.com/repositories/1/pulls/274/files?per_page=100&page=3>; rel="last"';
    expect(nextPage(link)).toBe(
      'https://api.github.com/repositories/1/pulls/274/files?per_page=100&page=2',
    );
    expect(nextPage('<https://api.github.com/x?page=1>; rel="prev"')).toBeUndefined();
    expect(nextPage(null)).toBeUndefined();
  });
});

describe('what a push changed', () => {
  it('lists the files under the UI roots that differ between the two heads', () => {
    const repo = mkdtempSync(path.join(tmpdir(), 'ui-review-gate-'));
    const git = (...args: string[]) =>
      execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
        cwd: repo,
        encoding: 'utf8',
      }).trim();
    const write = (file: string, text: string) => {
      mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
      writeFileSync(path.join(repo, file), text);
    };
    try {
      git('init', '-q');
      write('apps/mobile/src/ui/text/Text.tsx', 'one');
      write('apps/mobile/src/features/vote/board.tsx', 'one');
      write('apps/mobile/src/app/crew/new.tsx', 'one');
      write('services/api/src/app.ts', 'one');
      git('add', '.');
      git('commit', '-q', '-m', 'before');
      const before = git('rev-parse', 'HEAD');
      write('apps/mobile/src/ui/text/Text.tsx', 'two');
      write('apps/mobile/src/features/vote/__tests__/board.test.tsx', 'new');
      write('services/api/src/app.ts', 'two');
      git('rm', '-q', 'apps/mobile/src/app/crew/new.tsx');
      git('add', '.');
      git('commit', '-q', '-m', 'after');
      const after = git('rev-parse', 'HEAD');

      const pushed = uiFilesBetween(before, after, repo);
      expect(pushed.sort()).toEqual([
        'apps/mobile/src/app/crew/new.tsx',
        'apps/mobile/src/features/vote/__tests__/board.test.tsx',
        'apps/mobile/src/ui/text/Text.tsx',
      ]);
      // The gate's rule then leaves the test out.
      expect(pushed.filter(isUiChange).sort()).toEqual([
        'apps/mobile/src/app/crew/new.tsx',
        'apps/mobile/src/ui/text/Text.tsx',
      ]);
      expect(uiFilesBetween(after, after, repo)).toEqual([]);
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });
});
