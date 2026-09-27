import { describe, expect, it, jest } from '@jest/globals';

import { linkApple, linkGoogle, type LinkSocialClient, type NativeIdTokenProvider } from '../link';

function fakeNative(result?: { idToken: string; nonce: string }) {
  const requestIdToken = jest
    .fn<NativeIdTokenProvider['requestIdToken']>()
    .mockResolvedValue(result);
  const native: NativeIdTokenProvider = { requestIdToken };
  return { native, requestIdToken };
}

function fakeClient(response: Awaited<ReturnType<LinkSocialClient['linkSocial']>>) {
  const linkSocial = jest.fn<LinkSocialClient['linkSocial']>().mockResolvedValue(response);
  const client: LinkSocialClient = { linkSocial };
  return { client, linkSocial };
}

describe('linkApple / linkGoogle', () => {
  it('returns cancelled when the native sheet is dismissed without a token', async () => {
    const { native } = fakeNative(undefined);
    const { client, linkSocial } = fakeClient({ data: { status: true }, error: null });
    const outcome = await linkApple(native, client);
    expect(outcome).toEqual({ kind: 'cancelled' });
    expect(linkSocial).not.toHaveBeenCalled();
  });

  it('returns linked on a successful response', async () => {
    const { native } = fakeNative({ idToken: 'id-token', nonce: 'nonce-1' });
    const { client, linkSocial } = fakeClient({ data: { status: true }, error: null });
    const outcome = await linkGoogle(native, client);
    expect(outcome).toEqual({ kind: 'linked' });
    expect(linkSocial).toHaveBeenCalledWith({
      provider: 'google',
      idToken: { token: 'id-token', nonce: 'nonce-1' },
    });
  });

  it('returns merge_required with the ticket when the conflict is wrapped in this app envelope', async () => {
    const { native } = fakeNative({ idToken: 'id-token', nonce: 'nonce-1' });
    const { client } = fakeClient({
      data: null,
      error: {
        status: 409,
        error: { code: 'MERGE_REQUIRED', detail: { ticket: 'ticket-abc' } },
      },
    });
    const outcome = await linkApple(native, client);
    expect(outcome).toEqual({ kind: 'merge_required', ticket: 'ticket-abc' });
  });

  it('returns different_emails_not_allowed for that specific Better Auth code', async () => {
    const { native } = fakeNative({ idToken: 'id-token', nonce: 'nonce-1' });
    const { client } = fakeClient({
      data: null,
      error: { status: 401, code: 'LINKING_DIFFERENT_EMAILS_NOT_ALLOWED' },
    });
    const outcome = await linkGoogle(native, client);
    expect(outcome).toEqual({ kind: 'different_emails_not_allowed' });
  });

  it('falls back to a generic error outcome for anything else', async () => {
    const { native } = fakeNative({ idToken: 'id-token', nonce: 'nonce-1' });
    const { client } = fakeClient({ data: null, error: { status: 500, code: 'BOOM' } });
    const outcome = await linkApple(native, client);
    expect(outcome).toEqual({ kind: 'error', code: 'BOOM' });
  });
});
