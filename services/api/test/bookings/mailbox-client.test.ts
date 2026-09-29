import { randomBytes } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  exchangeMailboxCode,
  mailboxAuthorizeUrl,
  revokeMailbox,
  type MailboxOAuthConfig,
} from '../../src/bookings/mailbox-client';

function config(
  reply: { status: number; body: unknown },
  calls: { url: string; body: string }[],
): MailboxOAuthConfig {
  return {
    providers: {
      gmail: { clientId: 'g-id', clientSecret: 'g-secret' },
      microsoft: { clientId: 'm', clientSecret: 'ms' },
    },
    publicBaseUrl: 'https://api.test',
    appScheme: 'critterpass',
    keyring: { activeKeyId: 'k1', keys: { k1: randomBytes(32) } },
    fetch: (input, init) => {
      calls.push({
        url: input instanceof Request ? input.url : String(input),
        body: String(init?.body as string),
      });
      return Promise.resolve(new Response(JSON.stringify(reply.body), { status: reply.status }));
    },
  };
}

describe('mailbox OAuth', () => {
  it('asks Gmail for read-only access, offline, with a PKCE challenge', () => {
    const url = new URL(
      mailboxAuthorizeUrl(config({ status: 200, body: {} }, []), 'gmail', 'state-123', 'challenge'),
    );
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('scope')).toBe('https://www.googleapis.com/auth/gmail.readonly');
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://api.test/v1/mailbox/oauth/gmail/callback',
    );
  });

  it('refuses a grant that comes without a refresh token', async () => {
    const calls: { url: string; body: string }[] = [];
    await expect(
      exchangeMailboxCode(
        config({ status: 200, body: { access_token: 'a' } }, calls),
        'gmail',
        'code',
        'v'.repeat(43),
      ),
    ).rejects.toMatchObject({ code: 'SUPPLIER_REJECTED' });
    expect(calls[0]?.body).toContain('code_verifier=');
  });

  it('revokes a Gmail grant at Google, and says when a provider cannot revoke', async () => {
    const calls: { url: string; body: string }[] = [];
    expect(
      await revokeMailbox(config({ status: 200, body: {} }, calls), 'gmail', '1//refresh'),
    ).toBe(true);
    expect(calls).toEqual([
      { url: 'https://oauth2.googleapis.com/revoke', body: 'token=1%2F%2Frefresh' },
    ]);
    const none: { url: string; body: string }[] = [];
    expect(await revokeMailbox(config({ status: 200, body: {} }, none), 'microsoft', 'x')).toBe(
      false,
    );
    expect(none).toEqual([]);
  });
});
