import { describe, expect, it, jest } from '@jest/globals';

import {
  decideReturningFlow,
  signInReturningPhone,
  type ReturningPhoneSignInClient,
} from '../returning';

function fakeClient(response: Awaited<ReturnType<ReturningPhoneSignInClient['post']>>) {
  const post = jest.fn<ReturningPhoneSignInClient['post']>().mockResolvedValue(response);
  const client: ReturningPhoneSignInClient = { post };
  return { client, post };
}

describe('decideReturningFlow', () => {
  it('signs in directly when no anonymous session exists yet', () => {
    expect(decideReturningFlow({ hasAnonymousSession: false, hasCrews: false })).toEqual({
      kind: 'sign_in_directly',
    });
  });

  it('signs in then GCs the anonymous uid when it has no crews (nothing worth losing)', () => {
    expect(decideReturningFlow({ hasAnonymousSession: true, hasCrews: false })).toEqual({
      kind: 'sign_in_then_gc_anonymous',
    });
  });

  it('routes to the merge-ticket path when the anonymous session has crews', () => {
    expect(decideReturningFlow({ hasAnonymousSession: true, hasCrews: true })).toEqual({
      kind: 'merge_ticket_path',
    });
  });
});

describe('signInReturningPhone', () => {
  const input = { phoneNumber: '+6598765432', code: '123456' };

  it('lands on the existing uid', async () => {
    const { client, post } = fakeClient({ data: { user: { id: 'uid-1' } }, error: null });
    await expect(signInReturningPhone(input, client)).resolves.toEqual({
      kind: 'signed_in',
      userId: 'uid-1',
    });
    expect(post).toHaveBeenCalledWith('/api/auth/sign-in/phone-number', input);
  });

  it('reports a number nobody held, now saved to this pass, as linked', async () => {
    const { client } = fakeClient({ data: { user: { id: 'uid-2' }, linked: true }, error: null });
    await expect(signInReturningPhone(input, client)).resolves.toEqual({ kind: 'linked' });
  });

  it('reports no_account for a 404', async () => {
    const { client } = fakeClient({ data: null, error: { status: 404 } });
    await expect(signInReturningPhone(input, client)).resolves.toEqual({ kind: 'no_account' });
  });

  it('reports rate_limited with retryAfterS for a 429', async () => {
    const { client } = fakeClient({
      data: null,
      error: { status: 429, detail: { retry_after_s: 90 } },
    });
    await expect(signInReturningPhone(input, client)).resolves.toEqual({
      kind: 'rate_limited',
      retryAfterS: 90,
    });
  });

  it('reports invalid_code for a VALIDATION error', async () => {
    const { client } = fakeClient({ data: null, error: { code: 'VALIDATION' } });
    await expect(signInReturningPhone(input, client)).resolves.toEqual({ kind: 'invalid_code' });
  });

  it('falls back to a generic error outcome', async () => {
    const { client } = fakeClient({ data: null, error: { code: 'BOOM' } });
    await expect(signInReturningPhone(input, client)).resolves.toEqual({
      kind: 'error',
      code: 'BOOM',
    });
  });
});
