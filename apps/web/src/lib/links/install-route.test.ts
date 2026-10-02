import { LINK_ENVIRONMENT_CONFIG } from '@cp/domain';
import { describe, expect, it } from 'vitest';

import { decideHandoff } from './handoff-model';
import { installRoute, parseTestFlightUrl } from './install-route';
import { linkRequestContext } from './web-env';

const TESTFLIGHT = 'https://testflight.apple.com/join/AbC123xy';
const IOS =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1';

describe('installRoute', () => {
  it('keeps both stores on production, whatever TestFlight link is configured', () => {
    expect(installRoute(LINK_ENVIRONMENT_CONFIG.production, '/i/K7M2QX', TESTFLIGHT)).toEqual({
      kind: 'stores',
      appStoreHref: 'https://apps.apple.com/app/id6816655856',
      playStoreHref:
        'https://play.google.com/store/apps/details?id=app.critterpass&referrer=cp_link%3D%252Fi%252FK7M2QX',
    });
  });

  it('offers TestFlight on staging when a link is configured, else asks the inviter', () => {
    expect(installRoute(LINK_ENVIRONMENT_CONFIG.staging, '/i/K7M2QX', TESTFLIGHT)).toEqual({
      kind: 'testflight',
      href: TESTFLIGHT,
    });
    expect(installRoute(LINK_ENVIRONMENT_CONFIG.staging, '/i/K7M2QX', null)).toEqual({
      kind: 'ask-inviter',
    });
  });

  it('accepts only a public TestFlight link', () => {
    expect(parseTestFlightUrl(` ${TESTFLIGHT} `)).toBe(TESTFLIGHT);
    for (const value of [
      undefined,
      '',
      'https://apps.apple.com/app/id1',
      'http://testflight.apple.com/join/AbC1',
      'https://testflight.apple.com.evil.example/join/AbC1',
    ]) {
      expect(parseTestFlightUrl(value), String(value)).toBeNull();
    }
  });
});

describe('an iOS open tap that reached the web (no app)', () => {
  const target = { kind: 'invite' as const, code: 'K7M2QX' };
  const preview = { status: 'unavailable' as const };
  const url = new URL('https://go.staging.critterpass.app/i/K7M2QX?open=1');

  it('goes on to TestFlight on staging when configured', () => {
    const context = linkRequestContext(url, { TESTFLIGHT_URL: TESTFLIGHT });
    expect(decideHandoff({ url, userAgent: IOS, context, target, preview })).toEqual({
      kind: 'redirect',
      location: TESTFLIGHT,
    });
  });

  it('stays on the page on staging without a TestFlight link', () => {
    const context = linkRequestContext(url, {});
    const decision = decideHandoff({ url, userAgent: IOS, context, target, preview });
    expect(decision.kind).toBe('render');
    expect(decision.kind === 'render' && decision.model.install).toEqual({ kind: 'ask-inviter' });
  });
});
