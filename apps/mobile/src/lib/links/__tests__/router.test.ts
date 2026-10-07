import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';

import { clearPendingLink, peekPendingLink, setOnboardingComplete } from '../pending';
import { createLinkResolverClient } from '../resolver-client';
import {
  configureLinkRouter,
  parseIncomingLink,
  resetLinkRouterForTests,
  resumePendingLink,
  routeIncomingUrl,
} from '../router';
import { fakeLinksHttp, standardRoutes } from '../test-support/fake-links-http';

const CREW = '0199a1c2-7b3e-7c10-9a55-3f1f6e2d4b02';
const TRIP = '0199a1c2-7b3e-7c10-9a55-3f1f6e2d4b03';

beforeEach(() => {
  clearPendingLink();
  setOnboardingComplete(true);
  configureLinkRouter({
    resolver: createLinkResolverClient(fakeLinksHttp(standardRoutes).http),
    now: () => 1_000_000,
  });
});

afterEach(() => resetLinkRouterForTests());

describe('routeIncomingUrl after onboarding', () => {
  it.each([
    [
      'https://critterpass.app/i/BAX6XA',
      '/onboarding/invite/ticket?code=BAX6XA&kind=invite&state=active',
    ],
    [
      'https://go.critterpass.app/j/bax-6xa?c=wa',
      '/onboarding/invite/ticket?code=BAX6XA&kind=invite&state=active',
    ],
    [`https://critterpass.app/plan/${TRIP}`, `/${TRIP}/plan`],
    ['https://critterpass.app/p/abcdefghijklmnop', '/community/link/abcdefghijklmnop'],
    ['https://critterpass.app/g/lundi', '/explore/lundi'],
    ['https://critterpass.app/locals/bali', '/pass'],
    ['critterpass-dev://locals/vn-da-lat', '/pass'],
    ['https://critterpass.app/app/vote/123', '/vote/123'],
    ['critterpass://trip/abc/day/2', '/trip/abc/day/2'],
    [`critterpass://trips/${TRIP}/day/2026-10-17`, `/trips/${TRIP}/day/2026-10-17`],
    [`critterpass://hub/${TRIP}`, `/trips/${TRIP}`],
    [`critterpass://hub/${TRIP}/day/2026-10-17`, `/trips/${TRIP}/day/2026-10-17`],
    [`critterpass://hub/${TRIP}/offline`, `/hub/${TRIP}/offline`],
    [
      'critterpass-dev://i/BAX6XA',
      '/onboarding/invite/ticket?code=BAX6XA&kind=invite&state=active',
    ],
  ])('routes %s to %s', async (url, expected) => {
    await expect(routeIncomingUrl(url)).resolves.toBe(expected);
  });

  it('sends a member to their crew Home instead of the invite', async () => {
    configureLinkRouter({ memberCrewForCode: (code) => (code === 'BAX6XA' ? CREW : null) });
    await expect(routeIncomingUrl('https://critterpass.app/i/BAX6XA')).resolves.toBe(
      `/?crewId=${CREW}`,
    );
  });

  it.each([
    'critterpass://',
    'critterpass:///',
    'critterpass-staging://?utm=x',
    'https://critterpass.app',
    'https://go.critterpass.app/',
  ])('opens Home, with no notice, for the bare link %s', async (url) => {
    await expect(routeIncomingUrl(url)).resolves.toBe('/');
  });

  it('goes Home with a notice for unknown or malformed links of ours', async () => {
    await expect(routeIncomingUrl('https://critterpass.app/i/ZZZZ2K')).resolves.toBe(
      '/?notice=link_unknown&at=1000000',
    );
    await expect(routeIncomingUrl('https://critterpass.app/i/not-a-code')).resolves.toBe(
      '/?notice=link_unknown&at=1000000',
    );
  });

  it('passes other URLs through untouched', async () => {
    await expect(routeIncomingUrl('/explore')).resolves.toBe('/explore');
    await expect(routeIncomingUrl('exp+critterpass://expo-development-client/')).resolves.toBe(
      'exp+critterpass://expo-development-client/',
    );
  });

  it('still routes when the api does not answer in time', async () => {
    configureLinkRouter({
      resolver: { preview: () => new Promise(() => undefined) },
      resolveTimeoutMs: 10,
    });
    await expect(routeIncomingUrl('https://critterpass.app/i/BAX6XA')).resolves.toBe(
      '/onboarding/invite/ticket?code=BAX6XA&kind=invite',
    );
  });
});

describe('before onboarding', () => {
  beforeEach(() => setOnboardingComplete(false));

  it('keeps the link pending and opens the invite ticket', async () => {
    await expect(routeIncomingUrl('https://critterpass.app/i/BAX6XA')).resolves.toBe(
      '/onboarding/invite/ticket?code=BAX6XA&kind=invite&state=active',
    );
    expect(peekPendingLink(1_000_000)?.link).toBe('/i/BAX6XA');
  });

  it('holds other links until the pass is issued, then resumes them once', async () => {
    await expect(routeIncomingUrl('https://critterpass.app/g/lundi')).resolves.toBe('/');
    setOnboardingComplete(true);
    await expect(resumePendingLink()).resolves.toBe('/explore/lundi');
    await expect(resumePendingLink()).resolves.toBeNull();
  });

  it('drops a pending link older than a day', async () => {
    await routeIncomingUrl('https://critterpass.app/g/lundi');
    setOnboardingComplete(true);
    configureLinkRouter({ now: () => 1_000_000 + 25 * 60 * 60 * 1000 });
    await expect(resumePendingLink()).resolves.toBeNull();
  });
});

describe('parseIncomingLink', () => {
  it('reads Universal Links, App Links and custom-scheme URLs alike', () => {
    expect(parseIncomingLink('https://go.staging.critterpass.app/r/BAX6XA')).toEqual({
      kind: 'referral',
      code: 'BAX6XA',
    });
    expect(parseIncomingLink('critterpass-staging://plan/' + TRIP)).toEqual({
      kind: 'plan',
      id: TRIP,
    });
    expect(parseIncomingLink('https://example.com/i/BAX6XA')).toBeNull();
  });
});
