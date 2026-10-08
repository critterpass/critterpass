import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import ts from 'typescript';

/**
 * The mobile app's import graph, read from source: which files a store build can run (everything a
 * route under `src/app` imports, the developer routes aside) and which app files a test file is
 * about. Barrels are followed by name, so one live export of `@/motion` does not make every motion
 * file look used.
 */
export const repoRoot = path.resolve(import.meta.dirname, '../..');
export const mobileSrc = 'apps/mobile/src';

/** One import or re-export edge: `names` is the imported names, or `'all'` for the whole module. */
type Edge = { to: string; names: string[] | 'all'; reExport: boolean; offered?: string };
type Parsed = { edges: Edge[]; mocked: string[] };

export type MobileGraph = {
  /** Tracked `.ts`/`.tsx` files under the app's `src`, repo-relative. */
  files: string[];
  /** Files a non-developer route reaches through value imports. */
  reachable: Set<string>;
  /** The app files a test file is about (see `subjectsOf`). */
  subjectsOf: (testFile: string) => string[];
};

const TEST_FILE = /\.test\.tsx?$/;
const DEV_ROUTE = /^apps\/mobile\/src\/app\/\(dev\)\//;
/** Inputs and harnesses a test borrows: never the thing it protects. */
const SUPPORT =
  /\/(test-support|__tests__|dev|gallery|scenes)\/|\/(scenes|fixtures)\.tsx?$|\.fixtures\.tsx?$|\/testing\.tsx?$/;

export function isTestFile(file: string): boolean {
  return TEST_FILE.test(file);
}

function listFiles(): string[] {
  const output = execFileSync('git', ['ls-files', mobileSrc], {
    cwd: repoRoot,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return output.split('\n').filter((file) => /\.tsx?$/.test(file) && !file.endsWith('.d.ts'));
}

function resolveSpecifier(from: string, specifier: string, known: Set<string>): string | null {
  let base: string;
  if (specifier.startsWith('@/')) base = path.posix.join(mobileSrc, specifier.slice(2));
  else if (specifier.startsWith('.')) base = path.posix.join(path.posix.dirname(from), specifier);
  else return null;
  const tails = ['', '.ts', '.tsx', '.ios.ts', '.ios.tsx', '.native.ts', '.native.tsx'];
  for (const tail of [...tails, ...tails.slice(1).map((ext) => `/index${ext}`)]) {
    if (known.has(base + tail)) return base + tail;
  }
  return null;
}

function parse(file: string, known: Set<string>): Parsed {
  const text = readFileSync(path.join(repoRoot, file), 'utf8');
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, false);
  const edges: Edge[] = [];
  const add = (specifier: string, names: Edge['names'], reExport: boolean): void => {
    const to = resolveSpecifier(file, specifier, known);
    if (to) edges.push({ to, names, reExport });
  };
  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      const clause = statement.importClause;
      if (clause?.isTypeOnly) continue;
      const bindings = clause?.namedBindings;
      if (clause && !clause.name && bindings && ts.isNamedImports(bindings)) {
        const names = bindings.elements
          .filter((element) => !element.isTypeOnly)
          .map((element) => (element.propertyName ?? element.name).text);
        if (names.length > 0) add(statement.moduleSpecifier.text, names, false);
      } else {
        add(statement.moduleSpecifier.text, 'all', false);
      }
    } else if (
      ts.isExportDeclaration(statement) &&
      statement.moduleSpecifier &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      !statement.isTypeOnly
    ) {
      const clause = statement.exportClause;
      if (clause && ts.isNamedExports(clause)) {
        for (const element of clause.elements) {
          if (element.isTypeOnly) continue;
          // `export { a as b } from './x'`: offered as `b`, declared in the target as `a`.
          const to = resolveSpecifier(file, statement.moduleSpecifier.text, known);
          if (!to) continue;
          const declared = (element.propertyName ?? element.name).text;
          edges.push({ to, names: [declared], reExport: true, offered: element.name.text });
        }
      } else {
        add(statement.moduleSpecifier.text, 'all', true);
      }
    }
  }
  // Lazy `require('…')` and `import('…')` still ship in the bundle.
  for (const match of text.matchAll(/\b(?:require|import)\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    if (match[1]) add(match[1], 'all', false);
  }
  const mocked: string[] = [];
  for (const match of text.matchAll(/\bjest\.(?:mock|doMock)\(\s*['"]([^'"]+)['"]/g)) {
    const to = match[1] ? resolveSpecifier(file, match[1], known) : null;
    if (to) mocked.push(to);
  }
  return { edges, mocked };
}

export function buildMobileGraph(): MobileGraph {
  const files = listFiles();
  const known = new Set(files);
  const parsed = new Map<string, Parsed>();
  const read = (file: string): Parsed => {
    let entry = parsed.get(file);
    if (!entry) {
      entry = parse(file, known);
      parsed.set(file, entry);
    }
    return entry;
  };

  /**
   * Visits `file` asked for `names`, and everything it pulls in. A file's own imports always load;
   * its re-exports are followed only for the names asked for.
   */
  const walk = (
    starts: { file: string; names: Edge['names'] }[],
    onFile: (file: string) => boolean,
  ): void => {
    const loaded = new Set<string>();
    const asked = new Map<string, Set<string> | 'all'>();
    const queue = [...starts];
    for (let next = queue.pop(); next; next = queue.pop()) {
      const { file, names } = next;
      const before = asked.get(file);
      if (before === 'all') continue;
      let fresh: string[] | 'all';
      if (names === 'all') {
        fresh = 'all';
        asked.set(file, 'all');
      } else {
        const seen = before ?? new Set<string>();
        fresh = names.filter((name) => !seen.has(name));
        for (const name of fresh) seen.add(name);
        asked.set(file, seen);
        if (fresh.length === 0 && loaded.has(file)) continue;
      }
      const first = !loaded.has(file);
      loaded.add(file);
      if (first && !onFile(file)) continue;
      for (const edge of read(file).edges) {
        if (!edge.reExport) {
          if (first) queue.push({ file: edge.to, names: edge.names });
          continue;
        }
        const { offered } = edge;
        if (offered === undefined) {
          // `export * from`: any name may live there.
          queue.push({ file: edge.to, names: fresh });
        } else if (fresh === 'all' || fresh.includes(offered)) {
          queue.push({ file: edge.to, names: edge.names });
        }
      }
    }
  };

  const reachable = new Set<string>();
  const routes = files.filter(
    (file) =>
      file.startsWith(`${mobileSrc}/app/`) &&
      !DEV_ROUTE.test(file) &&
      !isTestFile(file) &&
      !SUPPORT.test(file),
  );
  walk(
    routes.map((file) => ({ file, names: 'all' as const })),
    (file) => {
      reachable.add(file);
      return true;
    },
  );

  // Metro picks one platform's file; the other platform's sibling ships in the other store build.
  for (const file of [...reachable]) {
    const sibling = file.replace(/\.ios\.(tsx?)$/, '.android.$1');
    if (sibling !== file && known.has(sibling)) reachable.add(sibling);
  }

  const hasOwnCode = (file: string): boolean => {
    const { edges } = read(file);
    return edges.length === 0 || edges.some((edge) => !edge.reExport);
  };

  /**
   * What a test protects: the app files it imports (through barrels and its test-support
   * harnesses), leaving out modules it replaces with a double, lab scenes and fixtures. When some of
   * them live in the folder that holds the test, those are the subjects and the rest are helpers.
   */
  const subjectsOf = (testFile: string): string[] => {
    const mocked = new Set(read(testFile).mocked);
    const found = new Set<string>();
    walk([{ file: testFile, names: 'all' }], (file) => {
      if (file === testFile) return true;
      if (mocked.has(file)) return false;
      if (/\/test-support\/|\/testing\.tsx?$/.test(file)) return true;
      if (SUPPORT.test(file) || isTestFile(file)) return false;
      // A pure barrel is a signpost: its targets are the subjects.
      if (!hasOwnCode(file)) return true;
      found.add(file);
      return false;
    });
    const testDir = path.posix.dirname(testFile);
    const home = testDir.endsWith('/__tests__') ? path.posix.dirname(testDir) : testDir;
    const all = [...found].sort();
    const own = all.filter((file) => file.startsWith(`${home}/`));
    return own.length > 0 ? own : all;
  };

  return { files, reachable, subjectsOf };
}

export type AllowEntry = { file: string; reason: string };

/** Reads an allow-list beside the scripts; every entry names a file that exists and says why. */
export function readAllowList(name: string): AllowEntry[] {
  const file = path.join(import.meta.dirname, name);
  if (!existsSync(file)) return [];
  return JSON.parse(readFileSync(file, 'utf8')) as AllowEntry[];
}
