import { describe, expect, it, jest } from '@jest/globals';

import { ensureAnonymous, type AnonymousSessionClient } from '../session';

function fakeClient(
  getSessionResponse: Awaited<ReturnType<AnonymousSessionClient['getSession']>>,
  signInResponse: Awaited<ReturnType<AnonymousSessionClient['signInAnonymous']>>,
) {
  const getSession = jest
    .fn<AnonymousSessionClient['getSession']>()
    .mockResolvedValue(getSessionResponse);
  const signInAnonymous = jest
    .fn<AnonymousSessionClient['signInAnonymous']>()
    .mockResolvedValue(signInResponse);
  const client: AnonymousSessionClient = { getSession, signInAnonymous };
  return { client, getSession, signInAnonymous };
}

describe('ensureAnonymous', () => {
  it('reuses an existing session without signing in again', async () => {
    const { client, signInAnonymous } = fakeClient(
      { data: { user: { id: 'uid-existing' } } },
      {
        data: { user: { id: 'should-not-be-used' } },
        error: null,
      },
    );
    await expect(ensureAnonymous(client)).resolves.toEqual({
      userId: 'uid-existing',
      created: false,
    });
    expect(signInAnonymous).not.toHaveBeenCalled();
  });

  it('creates a new anonymous session when none exists', async () => {
    const { client } = fakeClient(
      { data: null },
      { data: { user: { id: 'uid-new' } }, error: null },
    );
    await expect(ensureAnonymous(client)).resolves.toEqual({ userId: 'uid-new', created: true });
  });

  it('throws when anonymous sign-in fails', async () => {
    const { client } = fakeClient({ data: null }, { data: null, error: { code: 'BOOM' } });
    await expect(ensureAnonymous(client)).rejects.toThrow(/BOOM/);
  });
});
