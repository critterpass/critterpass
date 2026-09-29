import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';

import { clearPendingLink, setOnboardingComplete } from '@/lib/links/pending';
import { resetLinkRouterForTests } from '@/lib/links/router';

import {
  createTapRouter,
  routeForTap,
  TAP_FALLBACK_ROUTE,
  tapFromCp,
  tapFromNotification,
  tapUrl,
  type PushTap,
} from '../routing';

const CREW = '0199a1c2-7b3e-7c10-9a55-3f1f6e2d4b02';
const NID = '0199a1c2-7b3e-7c10-9a55-3f1f6e2d4b09';

const cp = {
  v: 1,
  nid: NID,
  type: 'crew_chat',
  deeplink: `/crew/${CREW}/chat`,
  crew_id: CREW,
  sender: { kind: 'member', id: 'u-mai', name: 'Mai' },
  full: true,
};

function tap(overrides: Partial<PushTap> = {}): PushTap {
  return {
    nid: NID,
    deeplink: `/crew/${CREW}/chat`,
    type: 'crew_chat',
    crewId: CREW,
    ...overrides,
  };
}

describe('reading a tap from a push', () => {
  it('reads the cp block as an object or as the FCM JSON string', () => {
    expect(tapFromCp(cp)).toEqual(tap());
    expect(tapFromCp(JSON.stringify(cp))).toEqual(tap());
  });

  it('ignores anything without a notification id', () => {
    expect(tapFromCp('not json')).toBeNull();
    expect(tapFromCp({ ...cp, nid: ' ' })).toBeNull();
    expect(tapFromCp(['nid'])).toBeNull();
    expect(tapFromCp(undefined)).toBeNull();
  });

  it('keeps optional fields null when the block leaves them out', () => {
    expect(tapFromCp({ nid: NID })).toEqual({ nid: NID, deeplink: null, type: null, crewId: null });
  });

  it('finds the block in the iOS APNs payload', () => {
    const notification = {
      request: { content: { data: null }, trigger: { type: 'push', payload: { aps: {}, cp } } },
    };
    expect(tapFromNotification(notification)).toEqual(tap());
  });

  it('finds the block in Android FCM data', () => {
    const notification = {
      request: {
        content: { data: {} },
        trigger: { type: 'push', remoteMessage: { data: { cp: JSON.stringify(cp) } } },
      },
    };
    expect(tapFromNotification(notification)).toEqual(tap());
  });

  it('falls back to the content data of a local notification', () => {
    expect(tapFromNotification({ request: { content: { data: { cp } } } })).toEqual(tap());
  });

  it('is null for a notification that is not ours', () => {
    expect(tapFromNotification({ request: { content: { data: { hello: 1 } } } })).toBeNull();
  });
});

describe('the URL a deep link routes as', () => {
  it.each([
    [`/crew/${CREW}/chat`, `critterpass://crew/${CREW}/chat`],
    ['critterpass-dev://inbox', 'critterpass-dev://inbox'],
    ['https://critterpass.app/i/BAX6XA', 'https://critterpass.app/i/BAX6XA'],
  ])('%s → %s', (deeplink, url) => {
    expect(tapUrl(deeplink)).toBe(url);
  });

  it.each([null, '', '  ', 'crew/abc', '//evil.example/x'])('%p has no URL', (deeplink) => {
    expect(tapUrl(deeplink)).toBeNull();
  });
});

describe('routing a tap', () => {
  beforeEach(() => {
    clearPendingLink();
    setOnboardingComplete(true);
  });
  afterEach(() => resetLinkRouterForTests());

  it('opens the in-app route of a bare deep link through the link router', async () => {
    await expect(routeForTap(tap())).resolves.toBe(`/crew/${CREW}/chat`);
  });

  it('goes home before onboarding, like any other link', async () => {
    setOnboardingComplete(false);
    await expect(routeForTap(tap())).resolves.toBe('/');
  });

  it('opens the inbox when the push has no link or routing fails', async () => {
    await expect(routeForTap(tap({ deeplink: null }))).resolves.toBe(TAP_FALLBACK_ROUTE);
    await expect(routeForTap(tap(), () => Promise.reject(new Error('boom')))).resolves.toBe(
      TAP_FALLBACK_ROUTE,
    );
  });

  it('navigates once per notification, however many times it is reported', async () => {
    const opened: string[] = [];
    const router = createTapRouter({ navigate: (href) => opened.push(href) });
    await router.handle(tap());
    await router.handle(tap());
    await router.handle(null);
    await router.handle(tap({ nid: null, deeplink: '/inbox' }));
    await router.handle(tap({ nid: null, deeplink: '/inbox' }));
    expect(opened).toEqual([`/crew/${CREW}/chat`, '/inbox', '/inbox']);
  });

  it('reports a navigation failure instead of throwing', async () => {
    const errors: unknown[] = [];
    const router = createTapRouter({
      navigate: () => {
        throw new Error('not mounted');
      },
      onError: (error) => errors.push(error),
    });
    await router.handle(tap());
    expect(errors).toHaveLength(1);
  });
});
