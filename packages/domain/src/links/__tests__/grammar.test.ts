import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { JOIN_CODE_ALPHABET, JOIN_CODE_LENGTH } from '../codes';
import {
  buildLink,
  LINK_CHANNELS,
  linkPath,
  parseLink,
  parseLinkPath,
  type LinkTarget,
} from '../grammar';
import { ALL_LINK_HOSTS, linkHostsFor } from '../hosts';
import { buildSchemeUrl, parseSchemeUrl } from '../schemes';

const BASE64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

const code = fc
  .array(fc.constantFrom(...JOIN_CODE_ALPHABET), {
    minLength: JOIN_CODE_LENGTH,
    maxLength: JOIN_CODE_LENGTH,
  })
  .map((glyphs) => glyphs.join(''));
const seat = fc
  .tuple(
    fc.string({ unit: fc.constantFrom(...BASE64URL), minLength: 44, maxLength: 44 }),
    fc.string({
      unit: fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'),
      minLength: 1,
      maxLength: 8,
    }),
  )
  .map(([body, kid]) => body + kid);
const slug = fc
  .array(
    fc.string({
      unit: fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'),
      minLength: 1,
      maxLength: 8,
    }),
    {
      minLength: 1,
      maxLength: 4,
    },
  )
  .map((parts) => parts.join('-'));
const appSegment = fc.string({
  unit: fc.constantFrom(...`${BASE64URL}`),
  minLength: 1,
  maxLength: 20,
});

const target: fc.Arbitrary<LinkTarget> = fc.oneof(
  fc.record({ kind: fc.constant('invite' as const), code }),
  fc.record({ kind: fc.constant('invite' as const), code, seat }),
  fc.record({
    kind: fc.constant('plan_share' as const),
    token: fc.string({ unit: fc.constantFrom(...BASE64URL), minLength: 16, maxLength: 64 }),
  }),
  fc.record({ kind: fc.constant('referral' as const), code }),
  fc.record({ kind: fc.constant('plan' as const), id: fc.uuid() }),
  fc.record({ kind: fc.constant('guide' as const), slug }),
  fc.record({ kind: fc.constant('locals' as const), slug }),
  fc.record({
    kind: fc.constant('app' as const),
    path: fc.array(appSegment, { minLength: 1, maxLength: 8 }).map((parts) => parts.join('/')),
  }),
);

describe('link grammar', () => {
  it('round-trips build → parse for every kind, host and channel', () => {
    fc.assert(
      fc.property(
        target,
        fc.constantFrom(...ALL_LINK_HOSTS),
        fc.option(fc.constantFrom(...LINK_CHANNELS), { nil: undefined }),
        (linkTarget, host, channel) => {
          const url = buildLink(linkTarget, { host, ...(channel ? { channel } : {}) });
          expect(parseLink(url)).toEqual({ target: linkTarget, host, channel: channel ?? null });
          expect(parseLinkPath(linkPath(linkTarget))).toEqual(linkTarget);
        },
      ),
      { numRuns: 2000 },
    );
  });

  it('round-trips the custom scheme for every kind', () => {
    fc.assert(
      fc.property(
        target,
        fc.constantFrom('production', 'staging', 'development' as const),
        (t, env) => {
          expect(parseSchemeUrl(buildSchemeUrl(t, env))).toEqual(t);
        },
      ),
      { numRuns: 1000 },
    );
  });

  it('reads /j/ as an alias of /i/ and normalises typed codes', () => {
    expect(parseLinkPath('/j/k7m-2qx')).toEqual({ kind: 'invite', code: 'K7M2QX' });
    expect(parseLinkPath('/i/K7M2QX/')).toEqual({ kind: 'invite', code: 'K7M2QX' });
  });

  it('refuses foreign hosts, other schemes, ports, credentials and excluded paths', () => {
    const [primary] = linkHostsFor('production');
    expect(parseLink('https://evil.example/i/K7M2QX')).toBeNull();
    expect(parseLink(`http://${primary}/i/K7M2QX`)).toBeNull();
    expect(parseLink(`https://${primary}:8443/i/K7M2QX`)).toBeNull();
    expect(parseLink(`https://user@${primary}/i/K7M2QX`)).toBeNull();
    for (const path of ['/', '/tips/bali', '/legal/privacy', '/help', '/account/delete']) {
      expect(parseLink(`https://${primary}${path}`)).toBeNull();
    }
    expect(
      parseLink('https://go.critterpass.app/i/K7M2QX', { hosts: ['critterpass.app'] }),
    ).toBeNull();
  });

  it('refuses malformed params', () => {
    expect(parseLinkPath('/i/K7M2Q0')).toBeNull();
    expect(parseLinkPath('/i/K7M2QX/not-a-seat')).toBeNull();
    expect(parseLinkPath('/p/short')).toBeNull();
    expect(parseLinkPath('/plan/not-a-uuid')).toBeNull();
    expect(parseLinkPath('/g/Has_Upper')).toBeNull();
    expect(parseLinkPath('/locals/a/b')).toBeNull();
    expect(parseLinkPath('/app')).toBeNull();
    expect(parseLinkPath('/app/%E0%A4%A')).toBeNull();
    expect(parseLinkPath('/app/../secret')).toBeNull();
  });

  it('keeps bare paths and reads the share channel', () => {
    expect(parseLink('/r/K7M2QX?c=wa')).toEqual({
      target: { kind: 'referral', code: 'K7M2QX' },
      host: null,
      channel: 'wa',
    });
    expect(parseLink('https://critterpass.app/r/K7M2QX?c=nope')?.channel).toBeNull();
  });

  it('maps in-app scheme routes to the app kind', () => {
    expect(parseSchemeUrl('critterpass://trip/abc/day/2')).toEqual({
      kind: 'app',
      path: 'trip/abc/day/2',
    });
    expect(parseSchemeUrl('critterpass-dev:///i/K7M2QX?c=qr')).toEqual({
      kind: 'invite',
      code: 'K7M2QX',
    });
    expect(parseSchemeUrl('otherapp://i/K7M2QX')).toBeNull();
  });
});
