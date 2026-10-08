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
/** An in-app route's query as the grammar keeps it: plain names, values percent-encoded. */
const appSearch = fc
  .array(
    fc.tuple(
      fc
        .string({ unit: fc.constantFrom(...`${BASE64URL}.`), minLength: 1, maxLength: 12 })
        .filter((key) => key !== 'c'),
      fc.string({ maxLength: 24 }),
    ),
    { minLength: 1, maxLength: 4 },
  )
  .map((pairs) => pairs.map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&'));

/** 2,000 characters in the alphabets providers use for codes (base64 and base64url). */
const CODE_ALPHABET = `${BASE64URL}/+=`;
const LONG_CODE = Array.from(
  { length: 2000 },
  (_, index) => CODE_ALPHABET[(index * 7) % CODE_ALPHABET.length],
).join('');

const target: fc.Arbitrary<LinkTarget> = fc.oneof(
  fc.record({ kind: fc.constant('invite' as const), code }),
  fc.record({ kind: fc.constant('invite' as const), code, seat }),
  fc.record({
    kind: fc.constant('plan_share' as const),
    token: fc.string({ unit: fc.constantFrom(...BASE64URL), minLength: 16, maxLength: 64 }),
  }),
  fc.record({
    kind: fc.constant('recap_share' as const),
    token: fc.string({ unit: fc.constantFrom(...BASE64URL), minLength: 16, maxLength: 64 }),
  }),
  fc.record({ kind: fc.constant('referral' as const), code }),
  fc.record({ kind: fc.constant('plan' as const), id: fc.uuid() }),
  fc.record({ kind: fc.constant('guide' as const), slug }),
  fc.record({ kind: fc.constant('locals' as const), slug }),
  fc.record(
    {
      kind: fc.constant('app' as const),
      path: fc.array(appSegment, { minLength: 1, maxLength: 8 }).map((parts) => parts.join('/')),
      search: appSearch,
    },
    { requiredKeys: ['kind', 'path'] },
  ),
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
    expect(parseLinkPath('/rc/short')).toBeNull();
    expect(parseLinkPath('/rc/K7M2QX')).toBeNull();
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

  it('keeps a recap link apart from a referral code', () => {
    const shared = 'abcdefghijklmnopqrstuvwx';
    expect(parseLinkPath(`/rc/${shared}`)).toEqual({ kind: 'recap_share', token: shared });
    expect(parseLinkPath(`/r/${shared}`)).toBeNull();
    expect(parseSchemeUrl(`critterpass://rc/${shared}`)).toEqual({
      kind: 'recap_share',
      token: shared,
    });
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

  it('keeps the query of an in-app route and drops its fragment', () => {
    const mailbox: LinkTarget = {
      kind: 'app',
      path: 'wallet/mailbox/connected',
      search: 'provider=gmail&status=connected',
    };
    expect(
      parseSchemeUrl('critterpass://wallet/mailbox/connected?provider=gmail&status=connected'),
    ).toEqual(mailbox);
    expect(buildSchemeUrl(mailbox, 'staging')).toBe(
      'critterpass-staging://wallet/mailbox/connected?provider=gmail&status=connected',
    );
    expect(
      parseSchemeUrl('critterpass-dev://setup/calendar/connected?provider=google&status=failed#x'),
    ).toEqual({
      kind: 'app',
      path: 'setup/calendar/connected',
      search: 'provider=google&status=failed',
    });
    expect(parseSchemeUrl('critterpass://app/recap/abc/postcard?postcard_id=p1')).toEqual({
      kind: 'app',
      path: 'recap/abc/postcard',
      search: 'postcard_id=p1',
    });
    const link = parseLink('https://critterpass.app/app/crew?seat_offer=o1&c=wa');
    expect(link).toEqual({
      target: { kind: 'app', path: 'crew', search: 'seat_offer=o1' },
      host: 'critterpass.app',
      channel: 'wa',
    });
    expect(parseLinkPath(linkPath(mailbox))).toEqual(mailbox);
  });

  it('writes an in-app query in one form, and drops one it cannot read', () => {
    expect(parseSchemeUrl('critterpass://memory/m1?trip=a+b&note=caf%C3%A9%20%26%20bar')).toEqual({
      kind: 'app',
      path: 'memory/m1',
      search: 'trip=a%20b&note=caf%C3%A9%20%26%20bar',
    });
    const bare = { kind: 'app', path: 'memory/m1' };
    expect(parseSchemeUrl('critterpass://memory/m1?')).toEqual(bare);
    expect(parseSchemeUrl('critterpass://memory/m1?c=wa')).toEqual(bare);
    expect(parseSchemeUrl('critterpass://memory/m1?bad%ZZ=1')).toEqual(bare);
    expect(parseSchemeUrl('critterpass://memory/m1?na%20me=1')).toEqual(bare);
    expect(parseSchemeUrl(`critterpass://memory/m1?trip=${'x'.repeat(8200)}`)).toEqual(bare);
    const many = Array.from({ length: 17 }, (_, index) => `k${index}=1`).join('&');
    expect(parseSchemeUrl(`critterpass://memory/m1?${many}`)).toEqual(bare);
  });

  it('carries an OAuth return whole: a long authorization code arrives unchanged', () => {
    // As the api's callback writes it: the provider's state and code go back in the query.
    const back = new URL('critterpass://setup/calendar/connected');
    back.searchParams.set('provider', 'outlook');
    back.searchParams.set('status', 'authorized');
    back.searchParams.set('state', 'st_4f-9a_Q');
    back.searchParams.set('code', LONG_CODE);
    const parsed = parseSchemeUrl(back.toString());
    expect(parsed).toMatchObject({ kind: 'app', path: 'setup/calendar/connected' });
    if (parsed?.kind !== 'app' || parsed.search === undefined) throw new Error('no query kept');
    // Decoded once, as the screen's route params are.
    const codeOf = (search: string) => new URLSearchParams(search).get('code');
    expect(codeOf(parsed.search)).toBe(LONG_CODE);
    expect(new URLSearchParams(parsed.search).get('state')).toBe('st_4f-9a_Q');
    // The pending slot keeps the link as its path; a rebuilt scheme URL reads the same.
    const stored = parseLinkPath(linkPath(parsed));
    expect(stored).toEqual(parsed);
    expect(parseSchemeUrl(buildSchemeUrl(parsed, 'production'))).toEqual(parsed);
    const viaWeb = parseLink(`https://critterpass.app${linkPath(parsed)}`)?.target;
    expect(viaWeb).toEqual(parsed);
  });

  it('leaves the query of every other kind out of the link', () => {
    expect(parseSchemeUrl('critterpass://plan/0199a1c2-7b3e-7c10-9a55-3f1f6e2d4b03?x=1')).toEqual({
      kind: 'plan',
      id: '0199a1c2-7b3e-7c10-9a55-3f1f6e2d4b03',
    });
    expect(parseLink('https://critterpass.app/g/lundi?x=1')?.target).toEqual({
      kind: 'guide',
      slug: 'lundi',
    });
    expect(parseLinkPath('/g/lundi?x=1')).toBeNull();
  });
});
