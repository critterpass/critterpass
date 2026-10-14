/**
 * The UI sweep: the premium design | device captures under `e2e/screens/` (one flow per journey
 * part, each taking `premium-<code>-<state>-<look>` screenshots through `subflows/shot.yaml`), and
 * the coverage report that shows which premium designs and app routes it never reaches.
 *
 *   tsx tools/scripts/ci-device/sweep-coverage.ts            print the coverage report (markdown)
 *   tsx tools/scripts/ci-device/sweep-coverage.ts --out f.md write the report to a file
 *   tsx tools/scripts/ci-device/sweep-coverage.ts --run <ios> --run <android>
 *                                       what downloaded runs (folders of `device-<os>-shard-N`)
 *                                       captured, per platform and together
 *
 * A design code (`3.01`) names a render in `docs/design-renders/premium/` (titled in its
 * `screens.json`); compare mode pairs each screenshot with the render its code names.
 */
import { existsSync, globSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');
export const SWEEP_DIR = 'e2e/screens';
export const RENDERS_JSON = 'docs/design-renders/premium/screens.json';

/**
 * Every user-facing route file (under `apps/mobile/src/app`, without extension) and the premium
 * design codes of the sweep screenshots that show it, or why the sweep can't reach it.
 */
export const ROUTE_SHOTS: Readonly<Record<string, readonly string[] | { unreachable: string }>> = {
  '(modal)/bookings/pass/[id]': ['7.11'],
  '(modal)/boost/[tripId]': ['9.12'],
  '(modal)/paywall/compare': ['9.11'],
  '(modal)/paywall/index': ['9.10'],
  '(tabs)/index': ['3.01', '3.02'],
  '(tabs)/pass/index': ['9.01'],
  '(tabs)/trips/[tripId]/day/[date]': ['6.04', '6.05'],
  '(tabs)/trips/index': ['3.05', '3.06'],
  '(tabs)/wallet/bookings/[id]': ['7.06', '7.10'],
  '(tabs)/wallet/bookings/add': ['7.03'],
  '(tabs)/wallet/bookings/add-sheet': ['1.06'],
  '(tabs)/wallet/bookings/archive': ['7.14'],
  '(tabs)/wallet/bookings/edit/[id]': ['7.04'],
  '(tabs)/wallet/bookings/index': ['7.01', '7.02'],
  '(tabs)/wallet/bookings/insurance': ['7.13'],
  '(tabs)/wallet/bookings/mailbox': ['7.05'],
  '(tabs)/wallet/bookings/pass/[id]': ['7.11'],
  '(tabs)/wallet/bookings/paste': ['7.03'],
  '(tabs)/wallet/money/budget': ['7.29'],
  '(tabs)/wallet/money/index': ['7.16', '7.17'],
  '(trip)/[tripId]/day-trips/index': ['4.49'],
  '(trip)/[tripId]/day/[day]/index': ['4.26'],
  '(trip)/[tripId]/day/[day]/map': ['4.25'],
  '(trip)/[tripId]/draft/drafting': ['4.20'],
  '(trip)/[tripId]/draft/index': ['4.22'],
  '(trip)/[tripId]/drivers/check': ['6.22'],
  '(trip)/[tripId]/drivers/compare': ['6.23'],
  '(trip)/[tripId]/drivers/directory/[listingId]': ['6.20'],
  '(trip)/[tripId]/drivers/directory/index': ['6.25'],
  '(trip)/[tripId]/drivers/index': ['6.19'],
  '(trip)/[tripId]/drivers/tours': ['6.21'],
  '(trip)/[tripId]/explore/index': ['4.30'],
  '(trip)/[tripId]/ideas/index': ['4.40'],
  '(trip)/[tripId]/ideas/placing/[jobId]': ['4.41'],
  '(trip)/[tripId]/plan/index': ['4.25', '4.27', '4.26'],
  '(trip)/[tripId]/plan/map': ['4.25', '4.27', '4.26'],
  '(trip)/[tripId]/review/[changesetId]': ['4.48'],
  '(trip)/[tripId]/search/index': ['4.30'],
  '(trip)/[tripId]/settings/cancel': ['4.55'],
  '(trip)/[tripId]/settings/dates': ['4.54'],
  '(trip)/[tripId]/settings/index': ['4.53'],
  '(trip)/[tripId]/setup/getting-there': ['4.18'],
  '(trip)/[tripId]/setup/index': ['4.08'],
  '(trip)/[tripId]/setup/route': ['4.19'],
  '(trip)/[tripId]/swipe/[sessionId]': ['4.42'],
  '(trip)/forecast/[tripId]': ['6.06'],
  '(trip)/getting-around': ['5.24'],
  '(trip)/help/index': ['6.16'],
  '(trip)/hub/[tripId]/day/[date]': ['6.04', '6.05'],
  '(trip)/hub/[tripId]/index': ['6.01', '6.02'],
  '(trip)/hub/[tripId]/offline': ['6.15'],
  '(trip)/hub/offline-storage': ['9.05'],
  '(trip)/map/[tripId]': ['6.10', '6.13', '6.11', '6.12'],
  '(trip)/proposal/[id]/tracker': ['4.51'],
  '+not-found': ['3.19'],
  'crew/[crewId]/edit': ['3.13'],
  'crew/[crewId]/invite': ['3.10'],
  'crew/[crewId]/leave': ['3.16'],
  'crew/[crewId]/member/[uid]': ['3.14'],
  'crew/[crewId]/settings': ['3.12'],
  'crew/index': ['3.07'],
  'crew/invite-friends': ['3.11'],
  'crew/new': ['3.08'],
  'explore/[destination]': ['4.04'],
  'explore/place/[placeId]': ['4.36'],
  'help-centre/ideas/index': ['9.07'],
  'help-centre/index': ['9.06'],
  'inbox/index': ['3.17', '3.18'],
  index: ['3.01'],
  'money/add': ['7.18'],
  'money/expense/[id]': ['7.21'],
  'money/history': ['7.23'],
  'money/payment/[id]': ['7.25', '7.26'],
  'money/payout-methods': ['7.27'],
  'money/settle': ['7.24', '7.28'],
  'onboarding/home': ['2.09', '2.10'],
  'onboarding/index': ['2.01', '2.03'],
  'onboarding/invite/code': ['2.15', '2.16'],
  'onboarding/invite/manifest': ['2.19'],
  'onboarding/invite/pass': ['2.14'],
  'onboarding/issued': ['2.11'],
  'onboarding/name': ['2.05', '2.06'],
  'onboarding/permissions': ['2.13'],
  'onboarding/photo': ['2.08'],
  'onboarding/save': ['2.12'],
  'onboarding/taste': ['2.07'],
  'places/[placeId]': ['4.03'],
  'places/search': ['4.02'],
  'vote/[pollId]/index': ['4.05'],
  'vote/[pollId]/reveal': ['4.06'],
  'vote/new-poll': ['4.01'],
  'you/app-icon': ['9.03'],
  'you/appearance': ['9.02'],
  'you/critterdex': ['8.01'],
  'you/delete/index': ['9.09'],
  'you/edit': ['9.02'],
  'you/pings': ['6.38'],
  'you/plan/index': ['9.17'],
  'you/settings/index': ['9.04'],
};

/** A premium design code at the start of a shot name (`3.01-home` → `3.01`). */
export function designCodeOf(name: string): string | undefined {
  return /^(\d+\.(?:\d+|store-\d+))(?=$|-)/u.exec(name)?.[1];
}

/**
 * The sweep's screenshots as `<code>-<state>` (the look left off): the `CODE`/`NAME` pairs handed
 * to `shot.yaml` (directly or through a subflow that passes them on) and the `premium-…` shots the
 * flows take themselves.
 */
export function sweepShots(root: string): string[] {
  const names = new Set<string>();
  for (const file of globSync(`${SWEEP_DIR}/**/*.yaml`, { cwd: root })) {
    const text = readFileSync(path.join(root, file), 'utf8');
    for (const match of text.matchAll(
      /CODE:\s*['"]?(\d+\.(?:\d+|store-\d+))['"]?\s*\n\s*NAME:\s*['"]?([\w-]+)/g,
    ))
      names.add(`${match[1] ?? ''}-${match[2] ?? ''}`);
    for (const match of text.matchAll(
      /takeScreenshot:\s*['"]?premium-(\d+\.(?:\d+|store-\d+))-([\w-]+?)-(?:\$\{LOOK\}|light|dark)(?=[\s'"]|$)/g,
    ))
      names.add(`${match[1] ?? ''}-${match[2] ?? ''}`);
  }
  return [...names].sort();
}

/** The premium design codes with a render (`screens.json`). */
export function renderCodes(root: string): string[] {
  const rows = JSON.parse(readFileSync(path.join(root, RENDERS_JSON), 'utf8')) as {
    readonly code: string;
  }[];
  return rows.map((row) => row.code);
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
  readonly renders: string[];
  readonly rendersMissing: string[];
  readonly routes: string[];
  readonly routesUnlisted: string[];
  readonly routesUnreachable: { route: string; reason: string }[];
  readonly routeShotsMissing: { route: string; code: string }[];
}

export function coverage(root: string): Coverage {
  const shots = sweepShots(root);
  const swept = new Set(
    shots.map(designCodeOf).filter((code): code is string => code !== undefined),
  );
  const renders = renderCodes(root);
  const routes = appRoutes(root);
  return {
    shots,
    renders,
    rendersMissing: renders.filter((code) => !swept.has(code)),
    routes,
    routesUnlisted: routes.filter((route) => ROUTE_SHOTS[route] === undefined),
    routesUnreachable: routes.flatMap((route) => {
      const entry = ROUTE_SHOTS[route];
      return entry && 'unreachable' in entry ? [{ route, reason: entry.unreachable }] : [];
    }),
    routeShotsMissing: routes.flatMap((route) => {
      const entry = ROUTE_SHOTS[route];
      if (!entry || 'unreachable' in entry) return [];
      return entry.filter((code) => !swept.has(code)).map((code) => ({ route, code }));
    }),
  };
}

export function formatCoverage(c: Coverage): string {
  const rendersSwept = c.renders.length - c.rendersMissing.length;
  const routesCovered = c.routes.length - c.routesUnlisted.length - c.routesUnreachable.length;
  const list = (items: readonly string[]) => (items.length ? items.join(', ') : 'none');
  return [
    '### Sweep coverage',
    '',
    `- Premium designs swept: **${String(rendersSwept)} of ${String(c.renders.length)}**. Not swept: ${list(c.rendersMissing)}.`,
    `- App routes swept: **${String(routesCovered)} of ${String(c.routes.length)}**. With no sweep step: ${list(c.routesUnlisted)}.`,
    `- Routes the sweep can't reach: ${c.routesUnreachable.length ? c.routesUnreachable.map((r) => `\`${r.route}\` (${r.reason})`).join('; ') : 'none'}.`,
    `- Route designs listed but never swept: ${c.routeShotsMissing.length ? c.routeShotsMissing.map((m) => `\`${m.route}\` → ${m.code}`).join(', ') : 'none'}.`,
    `- ${String(c.shots.length)} screenshot states.`,
    '',
  ].join('\n');
}

/** The design codes a run's screenshots show (`premium-<code>-<state>-<look>.png`), by platform. */
export function runShots(shardsDir: string): Map<string, string[]> {
  const byPlatform = new Map<string, string[]>();
  if (!existsSync(shardsDir)) return byPlatform;
  for (const shard of readdirSync(shardsDir)) {
    const platform = /^device-(ios|android)-shard-/.exec(shard)?.[1];
    const dir = path.join(shardsDir, shard, 'screenshots');
    if (!platform || !existsSync(dir)) continue;
    const names = readdirSync(dir)
      .filter((file) => file.startsWith('premium-') && file.endsWith('.png'))
      .map((file) => file.slice('premium-'.length, -'.png'.length));
    byPlatform.set(platform, [...(byPlatform.get(platform) ?? []), ...names]);
  }
  return byPlatform;
}

/** What one run captured against the designs: the codes it shows, and the ones it doesn't. */
export function runCoverage(
  shots: readonly string[],
  renders: readonly string[],
): { readonly captured: string[]; readonly missing: string[]; readonly states: number } {
  const seen = new Set(shots.map(designCodeOf).filter((code) => code !== undefined));
  return {
    captured: renders.filter((code) => seen.has(code)),
    missing: renders.filter((code) => !seen.has(code)),
    states: new Set(shots).size,
  };
}

/** The run's coverage per platform, as markdown, above the sweep's own (what its flows can reach). */
export function formatRunCoverage(
  byPlatform: ReadonlyMap<string, readonly string[]>,
  renders: readonly string[],
): string {
  const lines = ['### This run captured', ''];
  if (byPlatform.size === 0) lines.push('- No design | device screenshot in this run.');
  for (const [platform, shots] of byPlatform) {
    const c = runCoverage(shots, renders);
    lines.push(
      `- ${platform}: **${String(c.captured.length)} of ${String(renders.length)}** designs in ${String(c.states)} screenshots. Not captured: ${c.missing.length ? c.missing.join(', ') : 'none'}.`,
    );
  }
  return [...lines, ''].join('\n');
}

/** Several downloaded runs as one: each platform's shots from every run, and both together. */
export function mergedRunShots(dirs: readonly string[]): Map<string, string[]> {
  const merged = new Map<string, string[]>();
  for (const dir of dirs)
    for (const [platform, shots] of runShots(dir))
      merged.set(platform, [...(merged.get(platform) ?? []), ...shots]);
  if (merged.size > 1) merged.set('together', [...merged.values()].flat());
  return merged;
}

function main(): void {
  const { values } = parseArgs({
    args: process.argv.slice(2).filter((arg) => arg !== '--'),
    options: { out: { type: 'string' }, run: { type: 'string', multiple: true } },
  });
  const runs = values.run ?? [];
  const report =
    runs.length > 0
      ? formatRunCoverage(mergedRunShots(runs), renderCodes(REPO_ROOT))
      : formatCoverage(coverage(REPO_ROOT));
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
