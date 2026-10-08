import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { mobileSrc, readAllowList, repoRoot } from './mobile-import-graph';

/**
 * A component test (`*.test.tsx`) exists for behaviour: something is pressed, typed, held or
 * advanced, or a hook is driven, and the test asserts what changed (docs/code-standards.md §17).
 * A file that only renders and reads the tree back restates markup and copy, which the device
 * sheets and the runtime ui-qa guards already check.
 *
 * The check is deliberately simple: the file calls `fireEvent`, `userEvent`, `fireGestureHandler`,
 * `renderHook` or `act(`, or awaits a helper it imports from a `test-support` folder that does
 * more than set the scene (names starting with render, mount, open, seed or install only set it).
 *
 * Reading a failure: each line is a `.test.tsx` with none of those. Rewrite it around the
 * interaction, move its branch into a `.test.ts` beside the model, or delete it. A file that drives
 * state another way (a re-render, a synced row, an effect) goes in
 * `mobile-test-interaction-allow.json` with the reason.
 */
const ALLOW_FILE = 'mobile-test-interaction-allow.json';
const DIRECT = /\b(?:fireEvent|userEvent|fireGestureHandler|renderHook)\b|\bact\(/;
const SETS_THE_SCENE = /^(?:render|mount|open|seed|install)/;

/** Names a file imports by value from a `test-support` folder. */
export function supportHelpers(source: string): string[] {
  const names: string[] = [];
  const imports = /import\s+\{([^}]*)\}\s+from\s+['"]([^'"]*\/test-support\/[^'"]*)['"]/g;
  for (const match of source.matchAll(imports)) {
    for (const part of (match[1] ?? '').split(',')) {
      const name =
        part
          .trim()
          .split(/\s+as\s+/)
          .pop() ?? '';
      if (name !== '' && !part.trim().startsWith('type ')) names.push(name);
    }
  }
  return names;
}

export function hasInteraction(source: string): boolean {
  if (DIRECT.test(source)) return true;
  return supportHelpers(source)
    .filter((name) => !SETS_THE_SCENE.test(name))
    .some((name) => new RegExp(`\\bawait\\s+${name}\\s*\\(`).test(source));
}

function componentTests(): string[] {
  const output = execFileSync('git', ['ls-files', mobileSrc], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return output.split('\n').filter((file) => file.endsWith('.test.tsx'));
}

const read = (file: string): string => readFileSync(path.join(repoRoot, file), 'utf8');

describe('what counts as an interaction', () => {
  it('sees a press, a driven hook and an act scope', () => {
    expect(hasInteraction("await fireEvent.press(screen.getByTestId('go'));")).toBe(true);
    expect(hasInteraction('const { result } = await renderHook(() => useThing());')).toBe(true);
    expect(hasInteraction('await act(async () => { jest.advanceTimersByTime(100); });')).toBe(true);
  });

  it('sees an awaited helper from a test-support folder, but not one that only sets the scene', () => {
    const imports = "import { renderHome, until } from '../test-support/home-harness';\n";
    expect(hasInteraction(`${imports}await until(() => shown() === 'chava');`)).toBe(true);
    expect(hasInteraction(`${imports}await renderHome(<HomeScreen />, stack);`)).toBe(false);
    expect(hasInteraction("await until(() => true); // imported from './local'")).toBe(false);
  });

  it('does not take a render and a query for an interaction', () => {
    const source = "await render(<Card />);\nexpect(screen.getByText('Bali')).toBeTruthy();";
    expect(hasInteraction(source)).toBe(false);
    expect(hasInteraction('const fact = extract(row);')).toBe(false);
  });
});

describe('mobile component tests', () => {
  const allowList = readAllowList(ALLOW_FILE);
  const allowed = new Set(allowList.map((entry) => entry.file));
  const files = componentTests();

  it('each hold an interaction or a hook or state assertion', () => {
    expect(files.length).toBeGreaterThan(100);
    const failures = files.filter((file) => !allowed.has(file) && !hasInteraction(read(file)));
    expect(failures, `add a reason to ${ALLOW_FILE} only for a test kept on purpose`).toEqual([]);
  });

  it('keep the allow-list short and current: every entry has a reason and still needs one', () => {
    const known = new Set(files);
    for (const entry of allowList)
      expect(entry.reason.trim().length, entry.file).toBeGreaterThan(20);
    const stale = allowList
      .filter((entry) => known.has(entry.file) && hasInteraction(read(entry.file)))
      .map((entry) => entry.file);
    expect(stale, `these pass on their own: remove them from ${ALLOW_FILE}`).toEqual([]);
    expect(allowList.length).toBeLessThanOrEqual(20);
  });
});
