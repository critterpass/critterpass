/**
 * The UI sweep's coverage: which of the app's design screens have a sweep screenshot.
 *
 *   tsx tools/scripts/ci-device/sweep-coverage.ts            print the coverage report (markdown)
 *   tsx tools/scripts/ci-device/sweep-coverage.ts --out f.md write the report to a file
 *
 * Both sides are read, nothing is kept by hand: the design ids the app registers with its screen
 * registry (`registerScreens`, design id → route, in `apps/mobile/src/features`) and the
 * screenshots of the sweep's manifest (./sweep-manifest), each named for the design id it shows
 * (`3b-4-inbox`). A registered id with no screenshot fails `sweep-coverage.test.ts` unless
 * NO_SCREEN_BY_DESIGN says why it has none. The report also lists the routes under
 * `apps/mobile/src/app` that no registering feature names a path for: screens without a design.
 */
import { existsSync, globSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { LANGUAGES, manifestShots } from './sweep-manifest';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');
const FEATURES = 'apps/mobile/src/features';
const APP = 'apps/mobile/src/app';

/** Registered design ids the sweep has no screenshot of, and why none can be taken. */
export const NO_SCREEN_BY_DESIGN: Readonly<Record<string, string>> = {
  '3n-6': 'the lower half of Settings, the screen 3n-2 shows: no lab scene opens it scrolled there',
  '5b-4': "drawn from the phone's own notification settings, which no fixture sets",
  '5c-5': "the widget gallery lives in the phone's launcher, outside the app",
};

/** A design screen id a screenshot name starts with (`3b-4-inbox` → `3b-4`). */
export function designIdOf(name: string): string | undefined {
  return /^(\d+[a-z]-\d+)(?=$|-)/u.exec(name)?.[1];
}

function featureFiles(root: string): string[] {
  return globSync(`${FEATURES}/**/*.ts`, { cwd: root }).filter(
    (file) => !/__tests__|\.test\.ts$|test-support/.test(file),
  );
}

/** Design ids the app registers with the screen registry, and ids it looks up but nobody registers. */
export function registryIds(root: string): { registered: string[]; referenced: string[] } {
  const registered = new Set<string>();
  const referenced = new Set<string>();
  for (const file of featureFiles(root)) {
    const text = readFileSync(path.join(root, file), 'utf8');
    // A registry entry maps an id to a route: `'3b-4': HOME_ROUTES.inbox`, `'3b-4': '/inbox'`, or a
    // named builder (`'7c-1': placesMap,`, `'7h-3': dayScreen(checkRoutes.rain)`).
    for (const match of text.matchAll(
      /'(\d+[a-z]-\d+)'\s*:\s*(?:\w*ROUTES\.|'\/|\(|\w+Route|[a-z]\w*\s*[,(])/g,
    ))
      registered.add(match[1] ?? '');
    for (const match of text.matchAll(/hrefFor\('(\d+[a-z]-\d+)'/g)) referenced.add(match[1] ?? '');
  }
  return {
    registered: [...registered].sort(),
    referenced: [...referenced].filter((id) => !registered.has(id)).sort(),
  };
}

/** User-facing route files under `apps/mobile/src/app`, without extension. */
export function appRoutes(root: string): string[] {
  return globSync(`${APP}/**/*.tsx`, { cwd: root })
    .map((file) => path.relative(APP, file).replace(/\.tsx$/, ''))
    .filter((route) => !/(^|\/)(\(dev\)|__mocks__|__tests__|_layout$|\+native-intent$)/.test(route))
    .sort();
}

/** A route file as the path it serves, parameters blanked: `(tabs)/trips/[tripId]/index` → `/trips/[]`. */
export function routePath(route: string): string {
  const segments = route
    .split('/')
    .filter((segment) => !/^\(.+\)$/.test(segment) && segment !== 'index')
    .map((segment) => (segment.startsWith('[') ? '[]' : segment));
  return `/${segments.join('/')}`;
}

/**
 * The paths the registering features name: every path literal or template in a file that calls
 * `registerScreens` and in the `routes.ts` beside or above it, parameters blanked.
 */
export function registeredPaths(root: string): Set<string> {
  const files = new Set<string>();
  for (const file of featureFiles(root)) {
    if (!/registerScreens\(/.test(readFileSync(path.join(root, file), 'utf8'))) continue;
    files.add(file);
    for (const dir of [path.dirname(file), path.dirname(path.dirname(file))])
      if (existsSync(path.join(root, dir, 'routes.ts'))) files.add(path.join(dir, 'routes.ts'));
  }
  const paths = new Set<string>();
  for (const file of files) {
    const text = readFileSync(path.join(root, file), 'utf8');
    for (const match of text.matchAll(/['`](\/[^'`\s?#]*)/g)) {
      const literal = (match[1] ?? '').replace(/\$\{[^}]*\}/g, '[]').replace(/\[[^\]]*\]/g, '[]');
      paths.add(routePath(literal.replace(/^\//, '')));
    }
  }
  return paths;
}

export interface Coverage {
  /** Screenshot names per language. */
  readonly shots: string[];
  readonly registered: string[];
  /** Registered ids with neither a screenshot nor a reason: these fail the test. */
  readonly registeredMissing: string[];
  readonly registeredNoScreen: { id: string; reason: string }[];
  readonly referencedUnregistered: string[];
  readonly routes: string[];
  readonly routesWithoutDesign: string[];
  readonly renderIds: number;
  readonly renderIdsSwept: string[];
}

export function coverage(root: string): Coverage {
  const shots = manifestShots();
  const swept = new Set(shots.map(designIdOf).filter((id): id is string => id !== undefined));
  const { registered, referenced } = registryIds(root);
  const routes = appRoutes(root);
  const named = registeredPaths(root);
  const renders = new Set(
    readdirSync(path.join(root, 'docs/design-renders/screens'))
      .map((file) => /^(\d+[a-z]-\d+)_/.exec(file)?.[1])
      .filter((id): id is string => id !== undefined),
  );
  const unswept = registered.filter((id) => !swept.has(id));
  return {
    shots,
    registered,
    routes,
    registeredMissing: unswept.filter((id) => NO_SCREEN_BY_DESIGN[id] === undefined),
    registeredNoScreen: unswept.flatMap((id) => {
      const reason = NO_SCREEN_BY_DESIGN[id];
      return reason === undefined ? [] : [{ id, reason }];
    }),
    referencedUnregistered: referenced,
    routesWithoutDesign: routes.filter((route) => !named.has(routePath(route))),
    renderIds: renders.size,
    renderIdsSwept: [...swept].filter((id) => renders.has(id)).sort(),
  };
}

export function formatCoverage(c: Coverage): string {
  const covered = c.registered.length - c.registeredMissing.length - c.registeredNoScreen.length;
  const list = (items: readonly string[]) => (items.length ? items.join(', ') : 'none');
  return [
    '### Sweep coverage',
    '',
    `- Registered design ids with a screenshot: **${String(covered)} of ${String(c.registered.length)}**. With none: ${list(c.registeredMissing)}.`,
    `- No screen by design: ${c.registeredNoScreen.length ? c.registeredNoScreen.map((entry) => `${entry.id} (${entry.reason})`).join('; ') : 'none'}.`,
    `- Routes with no design (${String(c.routesWithoutDesign.length)} of ${String(c.routes.length)}; no registering feature names their path): ${list(c.routesWithoutDesign)}.`,
    `- Screens other screens link to that nobody registers yet: ${list(c.referencedUnregistered)}.`,
    `- Design renders with a sweep screenshot: ${String(c.renderIdsSwept.length)} of ${String(c.renderIds)}.`,
    `- ${String(c.shots.length)} screenshots per language, in ${LANGUAGES.join(' and ')}.`,
    '',
  ].join('\n');
}

function main(): void {
  const { values } = parseArgs({
    args: process.argv.slice(2).filter((arg) => arg !== '--'),
    options: { out: { type: 'string' } },
  });
  const report = formatCoverage(coverage(REPO_ROOT));
  if (values.out) writeFileSync(values.out, report);
  else console.log(report);
}

const isMainModule = import.meta.url === `file://${process.argv[1] ?? ''}`;
if (isMainModule) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
