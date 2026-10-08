import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import {
  claimPastedLink,
  claimTypedCode,
  resetDeferredLinkCheckForTests,
  resolveOnFirstLaunch,
  type DeferredDeps,
  type DeferredPrimitives,
  type LinkFunnelEvent,
} from '../deferred';
import { clearPendingLink, peekPendingLink, setOnboardingComplete } from '../pending';
import { createLinkResolverClient } from '../resolver-client';
import { configureLinkRouter, resetLinkRouterForTests } from '../router';
import {
  fakeLinksHttp,
  FIXTURES,
  standardRoutes,
  type Route,
} from '../test-support/fake-links-http';

const DEVICE = {
  id: '0199a1c2-7b3e-7c10-9a55-3f1f6e2d4b09',
  platform: 'android' as const,
  app_version: '1.0.0',
  tz: 'UTC',
};
const TICKET = '/onboarding/invite/ticket?code=BAX6XD&kind=invite&via=';

function primitives(overrides: Partial<DeferredPrimitives> = {}): DeferredPrimitives {
  return {
    platform: 'android',
    getInstallReferrer: () => Promise.resolve(null),
    detectLikelyLink: () => Promise.resolve(false),
    ...overrides,
  };
}

function deps(route: Route, prims: DeferredPrimitives, events: LinkFunnelEvent[] = []) {
  const fake = fakeLinksHttp(route);
  const value: DeferredDeps = {
    primitives: prims,
    client: createLinkResolverClient(fake.http),
    device: DEVICE,
    track: (event) => events.push(event),
    timeoutMs: 200,
  };
  return { deps: value, requests: fake.requests };
}

beforeEach(() => {
  resetDeferredLinkCheckForTests();
  clearPendingLink();
  setOnboardingComplete(false);
  configureLinkRouter({ now: () => 5_000 });
});

afterEach(() => resetLinkRouterForTests());

describe('resolveOnFirstLaunch on Android', () => {
  it('claims the Play referrer link and holds it for onboarding', async () => {
    const events: LinkFunnelEvent[] = [];
    const referrer = `utm_source=critterpass&cp_link=${encodeURIComponent('/i/BAX6XD')}`;
    const { deps: d, requests } = deps(
      standardRoutes,
      primitives({ getInstallReferrer: () => Promise.resolve(referrer) }),
      events,
    );
    const outcome = await resolveOnFirstLaunch(d);
    expect(outcome).toMatchObject({ kind: 'claimed', href: `${TICKET}referrer` });
    expect(requests[0]?.body).toMatchObject({ payload: { install_referrer: referrer } });
    expect(peekPendingLink(5_000)).toEqual({
      link: '/i/BAX6XD',
      capturedAt: 5_000,
      via: 'referrer',
    });
    expect(events.map((event) => event.name)).toEqual([
      'install_attributed',
      'deferred_link_checked',
    ]);
    await expect(resolveOnFirstLaunch(d)).resolves.toEqual({ kind: 'none' });
  });

  it('prefers a test run’s injected referrer and ignores organic installs', async () => {
    const injected = `cp_link=${encodeURIComponent('/i/BAX6XD')}`;
    const withOverride = deps(
      standardRoutes,
      primitives({ getReferrerOverride: () => Promise.resolve(injected) }),
    );
    await expect(resolveOnFirstLaunch(withOverride.deps)).resolves.toMatchObject({
      kind: 'claimed',
    });
    resetDeferredLinkCheckForTests();
    const organic = deps(
      standardRoutes,
      primitives({
        getInstallReferrer: () => Promise.resolve('utm_source=google-play&utm_medium=organic'),
      }),
    );
    await expect(resolveOnFirstLaunch(organic.deps)).resolves.toEqual({ kind: 'none' });
    expect(organic.requests).toEqual([]);
  });

  it('follows the referrer path itself when the api is unreachable', async () => {
    const referrer = `cp_link=${encodeURIComponent('/i/BAX6XA')}`;
    const { deps: d } = deps(
      () => ({ status: 503, body: {} }),
      primitives({ getInstallReferrer: () => Promise.resolve(referrer) }),
    );
    await expect(resolveOnFirstLaunch(d)).resolves.toMatchObject({
      kind: 'claimed',
      href: '/onboarding/invite/ticket?code=BAX6XA&kind=invite&via=referrer',
    });
  });

  it('gives up within the time limit and shows the normal splash', async () => {
    jest.useFakeTimers();
    const { deps: d } = deps(
      standardRoutes,
      primitives({ getInstallReferrer: () => new Promise(() => undefined) }),
    );
    const pending = resolveOnFirstLaunch(d);
    jest.advanceTimersByTime(250);
    await expect(pending).resolves.toEqual({ kind: 'none' });
    jest.useRealTimers();
  });
});

describe('iOS App Clip handoff', () => {
  it('claims the link the App Clip was opened with, before any paste check', async () => {
    const events: LinkFunnelEvent[] = [];
    const detectLikelyLink = jest.fn(() => Promise.resolve(true));
    const { deps: d, requests } = deps(
      standardRoutes,
      primitives({
        platform: 'ios',
        detectLikelyLink,
        consumeClipLink: () => Promise.resolve('https://critterpass.app/i/BAX6XD'),
      }),
      events,
    );
    await expect(resolveOnFirstLaunch(d)).resolves.toMatchObject({
      kind: 'claimed',
      href: `${TICKET}clip`,
    });
    expect(requests[0]?.body).toMatchObject({
      payload: { clip_url: 'https://critterpass.app/i/BAX6XD' },
    });
    expect(detectLikelyLink).not.toHaveBeenCalled();
    expect(events).toContainEqual({ name: 'install_attributed', via: 'clip' });
  });

  it('falls back to the paste offer when the clip left nothing', async () => {
    const { deps: d } = deps(
      standardRoutes,
      primitives({
        platform: 'ios',
        detectLikelyLink: () => Promise.resolve(true),
        consumeClipLink: () => Promise.resolve(null),
      }),
    );
    await expect(resolveOnFirstLaunch(d)).resolves.toEqual({ kind: 'offer_paste' });
  });
});

describe('iOS paste and typed codes', () => {
  it('only offers the paste control, then claims what was pasted', async () => {
    const { deps: d, requests } = deps(
      standardRoutes,
      primitives({ platform: 'ios', detectLikelyLink: () => Promise.resolve(true) }),
    );
    await expect(resolveOnFirstLaunch(d)).resolves.toEqual({ kind: 'offer_paste' });
    expect(requests).toEqual([]);
    await expect(claimPastedLink(' https://critterpass.app/i/BAX6XD ', d)).resolves.toMatchObject({
      kind: 'claimed',
      href: `${TICKET}paste`,
    });
  });

  it('sends a refused link or a malformed code to the code screen with the invalid notice', async () => {
    const { deps: d, requests } = deps(
      () => ({ status: 422, body: FIXTURES.claimCodeInvalid }),
      primitives({ platform: 'ios' }),
    );
    const invalid = { kind: 'invalid', href: '/onboarding/invite/code?notice=invalid' };
    await expect(claimPastedLink('https://critterpass.app/i/ZZZZ2K', d)).resolves.toEqual(invalid);
    await expect(claimTypedCode('K7M2Q0', d)).resolves.toEqual(invalid);
    expect(requests).toHaveLength(1);
  });
});
