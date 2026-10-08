import { beforeAll, describe, expect, it } from 'vitest';

import {
  buildMobileGraph,
  isTestFile,
  mobileSrc,
  readAllowList,
  type MobileGraph,
} from './mobile-import-graph';

/**
 * A test protects code a person can reach: every test file under the app's `src` is about files a
 * route under `src/app` imports (the developer routes under `(dev)` do not count, Metro keeps them
 * out of store builds). A test of code no screen runs costs time on every change and protects
 * nothing, so delete it with the code, or wire the code to a screen.
 *
 * Reading a failure: each line is `test file -> why`. "not reached from any route" names the
 * imported files nothing shipped imports; "no app file under test" means the test imports nothing
 * from `src` (a contract or tooling test); "developer tooling" is a test inside a `dev` folder.
 * Tests kept on purpose sit in `mobile-test-reachability-allow.json`, each with its reason.
 */
const ALLOW_FILE = 'mobile-test-reachability-allow.json';
const allowList = readAllowList(ALLOW_FILE);
const allowed = new Set(allowList.map((entry) => entry.file));

let graph: MobileGraph;
beforeAll(() => {
  graph = buildMobileGraph();
});

function problemOf(testFile: string): string | null {
  if (/\/dev\/|\/\(dev\)\//.test(testFile)) return 'developer tooling, never in a store build';
  const subjects = graph.subjectsOf(testFile);
  if (subjects.length === 0) return 'no app file under test';
  const dead = subjects.filter((file) => !graph.reachable.has(file));
  if (dead.length === 0) return null;
  const names = dead.map((file) => file.slice(mobileSrc.length + 1)).join(', ');
  return `not reached from any route: ${names}`;
}

describe('mobile tests and the code a screen runs', { timeout: 60_000 }, () => {
  it('reads the routes: the root layout is reached, and no developer route is', () => {
    expect(graph.reachable.has(`${mobileSrc}/app/_layout.tsx`)).toBe(true);
    const devRoutes = [...graph.reachable].filter((file) => file.includes('/app/(dev)/'));
    expect(devRoutes).toEqual([]);
    // A graph that lost its imports would pass everything or nothing.
    expect(graph.reachable.size).toBeGreaterThan(1000);
  });

  it('has every test about code a route reaches', () => {
    const failures = graph.files
      .filter((file) => isTestFile(file) && !allowed.has(file))
      .flatMap((file) => {
        const problem = problemOf(file);
        return problem === null ? [] : [`${file} -> ${problem}`];
      });
    expect(failures, `add a reason to ${ALLOW_FILE} only for a test kept on purpose`).toEqual([]);
  });

  it('keeps the allow-list short and current: every entry has a reason and still needs one', () => {
    const known = new Set(graph.files);
    for (const entry of allowList)
      expect(entry.reason.trim().length, entry.file).toBeGreaterThan(20);
    const stale = allowList
      .filter((entry) => known.has(entry.file) && problemOf(entry.file) === null)
      .map((entry) => entry.file);
    expect(stale, `these pass on their own: remove them from ${ALLOW_FILE}`).toEqual([]);
    expect(allowList.length).toBeLessThanOrEqual(20);
  });
});
