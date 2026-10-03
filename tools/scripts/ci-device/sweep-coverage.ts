/**
 * The UI sweep: one Maestro flow per seed scenario and language under `e2e/screens/sweep/`, and the
 * coverage report that shows which screens it never reaches.
 *
 *   tsx tools/scripts/ci-device/sweep-coverage.ts            print the coverage report (markdown)
 *   tsx tools/scripts/ci-device/sweep-coverage.ts --write    regenerate the top-level sweep flows
 *   tsx tools/scripts/ci-device/sweep-coverage.ts --out f.md write the report to a file
 *
 * The steps live in `e2e/screens/sweep/subflows/<scenario>.yaml`; the top-level flows only pick the
 * language and the demo seed, so every scenario runs in English and Vietnamese. The report lists
 * the screens the app registers (`registerScreens` in `apps/mobile/src/features`) and the routes
 * under `apps/mobile/src/app` that no sweep screenshot covers.
 */
import { globSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');
export const SWEEP_DIR = 'e2e/screens/sweep';
export const LANGUAGES = ['en', 'vi'] as const;

export interface Scenario {
  readonly name: string;
  /** The Developer tools seed button (`e2e/_shared/seed-demo.yaml`), after onboarding. */
  readonly seed?: string;
  /** False for the scenario that walks onboarding itself. */
  readonly onboard: boolean;
  readonly summary: string;
}

export const SCENARIOS: readonly Scenario[] = [
  { name: 'onboarding', onboard: false, summary: 'every screen before the pass is issued' },
  { name: 'first-run', onboard: true, summary: 'a new account with no crew yet' },
  {
    name: 'everyday',
    onboard: true,
    seed: 'dev-seed-demo',
    summary: 'the demo crew with a confirmed trip',
  },
  {
    name: 'inbox',
    onboard: true,
    seed: 'dev-seed-demo-inbox',
    summary: 'the demo crew with one card that needs you',
  },
  {
    name: 'caught-up',
    onboard: true,
    seed: 'dev-seed-demo-caught-up',
    summary: 'the demo crew with nothing that needs you',
  },
  {
    name: 'vote',
    onboard: true,
    seed: 'dev-seed-demo-vote',
    summary: "the demo crew's destination vote on its board",
  },
  {
    name: 'vote-final',
    onboard: true,
    seed: 'dev-seed-demo-vote-final',
    summary: "the demo crew's destination vote in its final",
  },
  { name: 'trip-hub', onboard: false, summary: "the trip hub's header over the trip's photo" },
  {
    name: 'labs-planning',
    onboard: false,
    summary: 'lab scenes for trip setup, the draft and the proposal',
  },
  {
    name: 'labs-wallet',
    onboard: false,
    summary: 'lab scenes for bookings, getting around and money',
  },
  { name: 'labs-guide', onboard: false, summary: "lab scenes for the guide's sheet" },
  { name: 'labs-plan', onboard: false, summary: 'lab scenes for the draft, the plan and its days' },
  { name: 'labs-trip', onboard: false, summary: 'lab scenes for the trip day and critters' },
];

/**
 * Every user-facing route file (under `apps/mobile/src/app`, without extension) and the sweep
 * screenshots that show it (names without the language prefix), or why the sweep can't reach it.
 */
export const ROUTE_SHOTS: Readonly<Record<string, readonly string[] | { unreachable: string }>> = {
  index: ['3b-1-first-run'],
  '(tabs)/index': ['3b-2-everyday', 'home-no-trip'],
  'onboarding/index': ['3a-1-splash'],
  'onboarding/name': ['3a-2-name', '3a-2-name-keyboard'],
  'onboarding/photo': ['3a-3-photo'],
  'onboarding/taste': ['3a-4-this-or-that', '3a-4-summary'],
  'onboarding/home': ['3a-5-home', '3a-5-home-search-keyboard'],
  'onboarding/issued': ['3a-6-issued'],
  'onboarding/save': ['3a-7-save'],
  'onboarding/phone': ['3a-8-phone', '3a-8-phone-keyboard', '3a-8-sign-in'],
  'onboarding/permissions': ['3a-9-permissions'],
  'onboarding/invite/code': ['3a-11-code-keyboard', '3a-11-code-wrong-keyboard'],
  'onboarding/invite/ticket': ['3a-10-ticket'],
  'onboarding/invite/pass': ['3a-12-pass'],
  'onboarding/invite/manifest': ['3a-13-manifest'],
  'inbox/index': ['3b-4-inbox', '3b-5-caught-up'],
  'crew/index': ['3g-3-crews'],
  'crew/new': ['crew-new-keyboard', 'crew-new-code'],
  'crew/invite-friends': ['crew-invite-friends'],
  'crew/[crewId]/chat/index': ['3g-1-chat', '3g-1-chat-keyboard', '3g-1-chat-empty'],
  'crew/[crewId]/settings': {
    unreachable: 'no screen links to it and none shows the crew id a link would need',
  },
  'crew/[crewId]/invite': { unreachable: 'opened only from crew settings' },
  'places/search': ['3b-7-search', '3b-7-search-keyboard'],
  'places/[placeId]': ['3b-8-guest'],
  'vote/pitch': ['3b-3-pitch-search', '3b-3-pitch-search-keyboard'],
  'vote/new-poll': ['3g-1-new-poll', '3g-1-new-poll-keyboard'],
  'vote/[pollId]/index': ['3c-1-showdown'],
  'vote/[pollId]/reveal': ['3c-2-reveal'],
  '(tabs)/trips/[tripId]/index': ['3k-1-photo'],
  '(trip)/map/[tripId]': ['3g-4-live-map'],
  '(trip)/map/crew/[crewId]': ['3g-4-live-map'],
  '+not-found': ['not-found'],
};

/** The top-level flow for one scenario in one language. */
export function renderSweepFlow(scenario: Scenario, lang: string): string {
  const lines = [
    'appId: app.critterpass.dev',
    '---',
    `# UI sweep (${lang}): ${scenario.summary}. Generated by`,
    `# tools/scripts/ci-device/sweep-coverage.ts --write; the steps live in subflows/${scenario.name}.yaml.`,
    '- runFlow:',
    '    file: subflows/start.yaml',
    '    env:',
    `      LANG: ${lang}`,
  ];
  if (scenario.onboard) lines.push('- runFlow: ../../home/subflows/onboard.yaml');
  if (scenario.seed) {
    lines.push('- runFlow:', '    file: ../../_shared/seed-demo.yaml', '    env:');
    lines.push(`      SEED: ${scenario.seed}`);
  }
  lines.push('- runFlow:', `    file: subflows/${scenario.name}.yaml`, '    env:');
  lines.push(`      LANG: ${lang}`);
  return `${lines.join('\n')}\n`;
}

export function sweepFlows(): { file: string; text: string }[] {
  return SCENARIOS.flatMap((scenario) =>
    LANGUAGES.map((lang) => ({
      file: path.join(SWEEP_DIR, `${scenario.name}-${lang}.yaml`),
      text: renderSweepFlow(scenario, lang),
    })),
  );
}

/**
 * Screenshot names the sweep takes, without their language prefix: the sweep subflows' own
 * (`${LANG}-…`) and those of the area subflows they run with the language passed on (`${PREFIX}-…`,
 * taken directly, handed to a scene opener as `SHOT`, or a `SCENE` handed to an opener that names
 * its shot `${PREFIX}-${SCENE}`), following `runFlow` files.
 */
export function sweepShots(root: string): string[] {
  const names = new Set<string>();
  const texts = new Map<string, string>();
  const refs = new Map<string, string[]>();
  const visit = (file: string) => {
    if (texts.has(file)) return;
    let text: string;
    try {
      text = readFileSync(path.join(root, file), 'utf8');
    } catch {
      return;
    }
    texts.set(file, text);
    refs.set(file, []);
    for (const match of text.matchAll(
      /(?:takeScreenshot|SHOT):\s*['"]?\$\{(?:LANG|PREFIX)\}-([\w-]+)/g,
    ))
      names.add(match[1] ?? '');
    for (const match of text.matchAll(/(?:runFlow|file):\s*([\w./-]+\.yaml)/g)) {
      const ref = path.normalize(path.join(path.dirname(file), match[1] ?? ''));
      refs.get(file)?.push(ref);
      visit(ref);
    }
  };
  for (const file of globSync(`${SWEEP_DIR}/subflows/*.yaml`, { cwd: root })) visit(file);
  const namesScenes = (file: string) =>
    /takeScreenshot:\s*['"]?\$\{PREFIX\}-\$\{SCENE\}/.test(texts.get(file) ?? '');
  for (const [file, text] of texts) {
    if (!(refs.get(file) ?? []).some(namesScenes)) continue;
    for (const match of text.matchAll(/SCENE:\s*['"]?(\d+[a-z]-\d+[\w-]*)/g))
      names.add(match[1] ?? '');
  }
  return [...names].sort();
}

/** A design screen id a screenshot name starts with (`3b-4-inbox` → `3b-4`). */
export function designIdOf(name: string): string | undefined {
  return /^(\d+[a-z]-\d+)(?=$|-)/u.exec(name)?.[1];
}

/** Design ids the app registers with the screen registry, and ids it looks up but nobody registers. */
export function registryIds(root: string): { registered: string[]; referenced: string[] } {
  const registered = new Set<string>();
  const referenced = new Set<string>();
  const files = globSync('apps/mobile/src/features/**/*.ts', { cwd: root }).filter(
    (file) => !/__tests__|\.test\.ts$|test-support/.test(file),
  );
  for (const file of files) {
    const text = readFileSync(path.join(root, file), 'utf8');
    // A registry entry maps an id to a route: `'3b-4': HOME_ROUTES.inbox` or `'3b-4': '/inbox'`.
    for (const match of text.matchAll(/'(\d+[a-z]-\d+)'\s*:\s*(?:\w*ROUTES\.|'\/|\(|\w+Route)/g))
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
  return globSync('apps/mobile/src/app/**/*.tsx', { cwd: root })
    .map((file) => path.relative('apps/mobile/src/app', file).replace(/\.tsx$/, ''))
    .filter((route) => !/(^|\/)(\(dev\)|__mocks__|__tests__|_layout$|\+native-intent$)/.test(route))
    .sort();
}

export interface Coverage {
  readonly shots: string[];
  readonly registeredMissing: string[];
  readonly referencedUnregistered: string[];
  readonly routesUnlisted: string[];
  readonly routesUnreachable: { route: string; reason: string }[];
  readonly routeShotsMissing: { route: string; shot: string }[];
  readonly renderIds: number;
  readonly renderIdsSwept: string[];
  readonly registered: string[];
  readonly routes: string[];
}

export function coverage(root: string): Coverage {
  const shots = sweepShots(root);
  const swept = new Set(shots.map(designIdOf).filter((id): id is string => id !== undefined));
  const { registered, referenced } = registryIds(root);
  const routes = appRoutes(root);
  const shotSet = new Set(shots);
  const renders = new Set(
    readdirSync(path.join(root, 'docs/design-renders/screens'))
      .map((file) => /^(\d+[a-z]-\d+)_/.exec(file)?.[1])
      .filter((id): id is string => id !== undefined),
  );
  return {
    shots,
    registered,
    routes,
    registeredMissing: registered.filter((id) => !swept.has(id)),
    referencedUnregistered: referenced,
    routesUnlisted: routes.filter((route) => ROUTE_SHOTS[route] === undefined),
    routesUnreachable: routes.flatMap((route) => {
      const entry = ROUTE_SHOTS[route];
      return entry && 'unreachable' in entry ? [{ route, reason: entry.unreachable }] : [];
    }),
    routeShotsMissing: routes.flatMap((route) => {
      const entry = ROUTE_SHOTS[route];
      if (!entry || 'unreachable' in entry) return [];
      return entry.filter((shot) => !shotSet.has(shot)).map((shot) => ({ route, shot }));
    }),
    renderIds: renders.size,
    renderIdsSwept: [...swept].filter((id) => renders.has(id)).sort(),
  };
}

export function formatCoverage(c: Coverage): string {
  const covered = c.registered.length - c.registeredMissing.length;
  const routesCovered = c.routes.length - c.routesUnlisted.length - c.routesUnreachable.length;
  const list = (items: readonly string[]) => (items.length ? items.join(', ') : 'none');
  return [
    '### Sweep coverage',
    '',
    `- Registered screens swept: **${String(covered)} of ${String(c.registered.length)}**. Not swept: ${list(c.registeredMissing)}.`,
    `- App routes swept: **${String(routesCovered)} of ${String(c.routes.length)}**. With no sweep step: ${list(c.routesUnlisted)}.`,
    `- Routes the sweep can't reach: ${c.routesUnreachable.length ? c.routesUnreachable.map((r) => `\`${r.route}\` (${r.reason})`).join('; ') : 'none'}.`,
    `- Route screenshots listed but never taken: ${c.routeShotsMissing.length ? c.routeShotsMissing.map((m) => `\`${m.route}\` → ${m.shot}`).join(', ') : 'none'}.`,
    `- Screens other screens link to that nobody registers yet: ${list(c.referencedUnregistered)}.`,
    `- Design renders with a sweep screenshot: ${String(c.renderIdsSwept.length)} of ${String(c.renderIds)} (${list(c.renderIdsSwept)}).`,
    `- ${String(c.shots.length)} screenshots per language, in ${LANGUAGES.join(' and ')}.`,
    '',
  ].join('\n');
}

function main(): void {
  const { values } = parseArgs({
    args: process.argv.slice(2).filter((arg) => arg !== '--'),
    options: { write: { type: 'boolean', default: false }, out: { type: 'string' } },
  });
  if (values.write) {
    for (const { file, text } of sweepFlows()) writeFileSync(path.join(REPO_ROOT, file), text);
    console.log(`Wrote ${String(sweepFlows().length)} sweep flows`);
    return;
  }
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
