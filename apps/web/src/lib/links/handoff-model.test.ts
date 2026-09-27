import { LINK_ENVIRONMENT_CONFIG } from '@cp/domain';
import { describe, expect, it } from 'vitest';

import { appleAppSiteAssociation, assetLinks, parseCertFingerprints } from './association';
import { expiresIn, handoffCopy } from './handoff-copy';
import { decideHandoff } from './handoff-model';
import { clearLinkSwitchesCache, fetchLinkSwitches } from './link-settings';
import { fetchLinkPreview } from './resolver-fetch';
import { playStoreUrl } from './store-url';
import { readUserAgent } from './ua';
import { linkRequestContext } from './web-env';

const IOS =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1';
const TIKTOK_ANDROID =
  'Mozilla/5.0 (Linux; Android 16; Pixel 9; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/140.0.0.0 Mobile Safari/537.36 musical_ly_2024 BytedanceWebview/d8a21c6';
const MESSENGER_IOS =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/MessengerForiOS;FBAV/480.0.0.0]';
const PRINT = Array.from({ length: 32 }, () => 'ab').join(':');

describe('readUserAgent', () => {
  it('tells platforms and in-app browsers apart', () => {
    expect(readUserAgent(IOS)).toEqual({ platform: 'ios', inAppBrowser: null });
    expect(readUserAgent(TIKTOK_ANDROID)).toEqual({ platform: 'android', inAppBrowser: 'tiktok' });
    expect(readUserAgent(MESSENGER_IOS).inAppBrowser).toBe('messenger');
    expect(readUserAgent('Mozilla/5.0 (Macintosh) Safari/605').platform).toBe('desktop');
    expect(readUserAgent(null)).toEqual({ platform: 'desktop', inAppBrowser: null });
  });
});

describe('store and association helpers', () => {
  it('puts the url-encoded link path into the Play install referrer', () => {
    const url = new URL(playStoreUrl(LINK_ENVIRONMENT_CONFIG.production, '/i/K7M2QX'));
    expect(url.search).toContain('referrer=cp_link%3D%252Fi%252FK7M2QX');
    expect(url.searchParams.get('referrer')).toBe('cp_link=%2Fi%2FK7M2QX');
  });

  it('publishes only well-formed fingerprints and only packages that have them', () => {
    const prints = parseCertFingerprints(
      JSON.stringify({ 'app.critterpass.staging': [PRINT, 'nope'], 'app.critterpass.dev': [] }),
    );
    expect(prints).toEqual({ 'app.critterpass.staging': [PRINT.toUpperCase()] });
    expect(assetLinks('staging.critterpass.app', prints).map((s) => s.target.package_name)).toEqual(
      ['app.critterpass.staging'],
    );
    expect(assetLinks('critterpass.app', prints)).toEqual([]);
    expect(parseCertFingerprints('{not json')).toEqual({});
  });
});

describe('decideHandoff', () => {
  const context = linkRequestContext(new URL('https://critterpass.app/i/K7M2QX'), {});

  it('keeps an iOS open tap that reached the web on the App Store, unless in an in-app browser', () => {
    const target = { kind: 'invite' as const, code: 'K7M2QX' };
    const preview = { status: 'unavailable' as const };
    const url = new URL('https://go.critterpass.app/i/K7M2QX?open=1');
    expect(decideHandoff({ url, userAgent: IOS, context, target, preview })).toEqual({
      kind: 'redirect',
      location: 'https://apps.apple.com/app/id6816655856',
    });
    const inApp = decideHandoff({
      url,
      userAgent: `${IOS} Instagram 350.0`,
      context,
      target,
      preview,
    });
    expect(inApp.kind).toBe('render');
  });

  it('points "Open in app" at the other host of the pair', () => {
    const goContext = linkRequestContext(new URL('https://go.critterpass.app/i/K7M2QX'), {});
    const decision = decideHandoff({
      url: new URL('https://go.critterpass.app/i/K7M2QX'),
      userAgent: IOS,
      context: goContext,
      target: { kind: 'invite', code: 'K7M2QX' },
      preview: { status: 'unavailable' },
    });
    expect(decision.kind === 'render' && decision.model.openInAppHref).toBe(
      'https://critterpass.app/i/K7M2QX?open=1',
    );
  });

  it('turns an api 404 into a not-found page', () => {
    expect(
      decideHandoff({
        url: new URL('https://critterpass.app/i/K7M2QX'),
        userAgent: IOS,
        context,
        target: { kind: 'invite', code: 'K7M2QX' },
        preview: { status: 'not_found' },
      }),
    ).toEqual({ kind: 'not_found' });
  });
});

describe('fetchLinkPreview', () => {
  it('passes visitor identity only with the proxy secret and degrades on failures', async () => {
    const seen: Headers[] = [];
    const fetchImpl = ((_: string, init: RequestInit) => {
      seen.push(new Headers(init.headers));
      return Promise.resolve(new Response('{}', { status: 500 }));
    }) as unknown as typeof fetch;
    const base = {
      apiBaseUrl: 'https://api.example',
      target: { kind: 'invite' as const, code: 'K7M2QX' },
      channel: null,
      visitorIp: '203.0.113.5',
      visitorUserAgent: IOS,
      fetchImpl,
    };
    expect(await fetchLinkPreview({ ...base, proxySecret: undefined })).toEqual({
      status: 'unavailable',
    });
    await fetchLinkPreview({ ...base, proxySecret: 's'.repeat(32) });
    expect(seen[0]?.has('x-cp-visitor-ip')).toBe(false);
    expect(seen[1]?.get('x-cp-visitor-ip')).toBe('203.0.113.5');
    expect(
      await fetchLinkPreview({
        ...base,
        proxySecret: undefined,
        target: { kind: 'app', path: 'trip/1' },
      }),
    ).toEqual({ status: 'unavailable' });
  });
});

describe('handoff copy', () => {
  it('names the inviter and the place, and marks a named seat', () => {
    const copy = handoffCopy(
      { kind: 'invite', code: 'K7M2QX', seat: 'x'.repeat(46) },
      {
        kind: 'invite',
        crew_name: 'Bali Six',
        inviter_first_name: 'Winston',
        trip_place: 'Bali',
        members_count: 4,
        expires_at: null,
        state: 'active',
      },
    );
    expect(copy.headline).toBe('Winston wants you in Bali');
    expect(copy.roster).toBe('4 already in · 1 spot with your name');
    expect(copy.cta).toBe('Join Bali Six');
  });

  it('counts down to expiry', () => {
    const now = new Date('2026-09-27T00:00:00Z');
    expect(expiresIn('2026-10-01T02:30:00Z', now)).toBe('Expires in 4d 2h');
    expect(expiresIn('2026-09-27T01:15:00Z', now)).toBe('Expires in 1h 15m');
    expect(expiresIn('2026-09-26T00:00:00Z', now)).toBeNull();
  });
});

describe('App Clip flag', () => {
  it('lists the host apps’ clips in the AASA only while the flag is on', () => {
    expect(appleAppSiteAssociation('staging.critterpass.app')).not.toHaveProperty('appclips');
    expect(
      appleAppSiteAssociation('staging.critterpass.app', { appClip: false }),
    ).not.toHaveProperty('appclips');
    expect(appleAppSiteAssociation('staging.critterpass.app', { appClip: true }).appclips).toEqual({
      apps: ['YFND2EEW8S.app.critterpass.staging.clip', 'YFND2EEW8S.app.critterpass.dev.clip'],
    });
    expect(appleAppSiteAssociation('go.critterpass.app', { appClip: true }).appclips).toEqual({
      apps: ['YFND2EEW8S.app.critterpass.clip'],
    });
  });

  it('shows the clip card in the Smart App Banner only while the flag is on', () => {
    const context = linkRequestContext(new URL('https://critterpass.app/i/K7M2QX'), {});
    const banner = (appClip: boolean | undefined) => {
      const decision = decideHandoff({
        url: new URL('https://critterpass.app/i/K7M2QX'),
        userAgent: IOS,
        context,
        target: { kind: 'invite', code: 'K7M2QX' },
        preview: { status: 'unavailable' },
        ...(appClip === undefined ? {} : { appClip }),
      });
      return decision.kind === 'render' ? decision.model.smartAppBanner : null;
    };
    expect(banner(undefined)).toBe(
      'app-id=6816655856, app-argument=https://critterpass.app/i/K7M2QX',
    );
    expect(banner(false)).not.toContain('app-clip');
    expect(banner(true)).toBe(
      'app-id=6816655856, app-argument=https://critterpass.app/i/K7M2QX, app-clip-bundle-id=app.critterpass.clip, app-clip-display=card',
    );
  });

  it('reads the flag from the api, caches it and stays off when the api cannot answer', async () => {
    clearLinkSwitchesCache();
    let calls = 0;
    const answering = (body: unknown, status = 200) =>
      (() => {
        calls += 1;
        return Promise.resolve(new Response(JSON.stringify(body), { status }));
      }) as unknown as typeof fetch;
    let now = 0;
    const read = (fetchImpl: typeof fetch, apiBaseUrl = 'https://api.example') =>
      fetchLinkSwitches({ apiBaseUrl, fetchImpl, now: () => now });

    expect(await read(answering({ app_clip: true }))).toEqual({ appClip: true });
    expect(await read(answering({ app_clip: false }))).toEqual({ appClip: true });
    expect(calls).toBe(1);
    now = 61_000;
    expect(await read(answering({ app_clip: false }))).toEqual({ appClip: false });
    expect(await read(answering({ error: {} }, 500), 'https://down.example')).toEqual({
      appClip: false,
    });
    const failing = (() => Promise.reject(new Error('offline'))) as unknown as typeof fetch;
    expect(await read(failing, 'https://offline.example')).toEqual({ appClip: false });
    expect(await read(answering({ app_clip: 'yes' }), 'https://odd.example')).toEqual({
      appClip: false,
    });
  });
});
