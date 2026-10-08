/**
 * Every in-app link the server sends opens a screen. The server writes links only through the
 * builders in `@cp/domain`; a sample of each goes through the app's own handling here, both ways a
 * link arrives (a push tap or an OAuth return as a URL under the app's scheme through the link
 * router; an inbox row or a briefing line as a bare path), and has to land on a route file under
 * `src/app`.
 */
import { readdirSync } from 'node:fs';
import path from 'node:path';

import {
  APP_LINK_SAMPLES,
  appLinkSchemeUrl,
  appRoutePattern,
  currentAppPath,
  FORMER_APP_LINK_SAMPLES,
  matchAppRoute,
  type AppRoutePattern,
} from '@cp/domain';
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';

import { clearPendingLink, setOnboardingComplete } from '../pending';
import { resetLinkRouterForTests, routeIncomingUrl } from '../router';

const APP_DIR = path.resolve(__dirname, '../../../app');

function routeFiles(dir = ''): string[] {
  return readdirSync(path.join(APP_DIR, dir), { withFileTypes: true }).flatMap((entry) => {
    const file = dir === '' ? entry.name : `${dir}/${entry.name}`;
    return entry.isDirectory() ? routeFiles(file) : [file];
  });
}

const routes = routeFiles()
  .map(appRoutePattern)
  .filter((route): route is AppRoutePattern => route !== null);

/**
 * `/trip/<trip id>/…` is not a screen: three route files forward it to the trip's own
 * `/<trip id>/…` with the rest of the path and the query. A link through them opens a screen only
 * when what it is forwarded to is one.
 */
const FORWARDERS = '(trip)/trip/';
const FORWARDED = /^\/trip(?=\/[^/]+\/)/u;
const screens = routes.filter((route) => !route.file.startsWith(FORWARDERS));

/** The screen file an in-app href opens, following a forwarder to where it lands; else null. */
function screenOf(href: string): string | null {
  const route = matchAppRoute(routes, href);
  if (route === null) return null;
  if (!route.file.startsWith(FORWARDERS)) return route.file;
  return matchAppRoute(screens, href.replace(FORWARDED, ''))?.file ?? null;
}

/** A push tap, and an OAuth return: the link under the app's scheme through the link router. */
const tapped = (link: string) => routeIncomingUrl(appLinkSchemeUrl('critterpass', link));
/** An inbox row or a briefing line: the bare path, former shapes read as today's. */
const pressed = (link: string) => currentAppPath(link);

const queryOf = (href: string) =>
  [...new URL(href, 'https://app.invalid').searchParams.entries()].sort();

beforeEach(() => {
  clearPendingLink();
  setOnboardingComplete(true);
});

afterEach(() => resetLinkRouterForTests());

describe('links the server sends', () => {
  it('finds the route files', () => {
    expect(screens.length).toBeGreaterThan(150);
    expect(routes.length - screens.length).toBe(3);
  });

  it.each(APP_LINK_SAMPLES.map((sample) => [sample.builder, sample.link] as const))(
    '%s opens a screen: %s',
    async (_builder, link) => {
      // A builder writes today's path; former shapes are only read, for links already sent.
      expect(pressed(link)).toBe(link);
      const screen = screenOf(link);
      expect(screen).not.toBeNull();

      const href = await tapped(link);
      expect(screenOf(href)).toBe(screen);
      expect(queryOf(href)).toEqual(queryOf(link));
    },
  );

  it.each(FORMER_APP_LINK_SAMPLES.map((sample) => [sample.former, sample.current] as const))(
    'a link sent earlier still opens its screen: %s',
    async (former, current) => {
      // Written as it was, the path has no screen: a builder that returned it would fail above.
      expect(screenOf(former)).toBeNull();
      const screen = screenOf(current);
      expect(screen).not.toBeNull();
      expect(screenOf(pressed(former))).toBe(screen);
      expect(screenOf(await tapped(former))).toBe(screen);
    },
  );

  it('does not take a forwarder for a screen', () => {
    expect(matchAppRoute(routes, '/trip/t1/no-such-screen')?.file).toBe(
      '(trip)/trip/[tripId]/[...rest].tsx',
    );
    expect(screenOf('/trip/t1/no-such-screen')).toBeNull();
    expect(screenOf('/trip/t1/setup/no/such/step')).toBeNull();
    expect(screenOf('/trip/t1/plan')).toBe('(trip)/[tripId]/plan/index.tsx');
  });
});
