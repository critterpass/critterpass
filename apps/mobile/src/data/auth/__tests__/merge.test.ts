import { afterEach, describe, expect, it, jest } from '@jest/globals';

import {
  confirmMerge,
  startMerge,
  type MergeExecuteClient,
  type MergeTicketClient,
} from '../merge';
import {
  registerOnSignOut,
  resetOnSignOutHooksForTests,
  type OnSignOutHook,
} from '../sign-out-hooks';

afterEach(() => resetOnSignOutHooksForTests());

function fakeTicketClient(response: Awaited<ReturnType<MergeTicketClient['post']>>) {
  const post = jest.fn<MergeTicketClient['post']>().mockResolvedValue(response);
  const client: MergeTicketClient = { post };
  return { client, post };
}

function fakeExecuteClient(response: Awaited<ReturnType<MergeExecuteClient['post']>>) {
  const post = jest.fn<MergeExecuteClient['post']>().mockResolvedValue(response);
  const client: MergeExecuteClient = { post };
  return { client, post };
}

describe('startMerge', () => {
  it('returns the preview without consuming anything', async () => {
    const { client, post } = fakeTicketClient({
      data: { crews: [{ id: 'c1', name: 'Crew', owner: 'anon' as const }], trips: [] },
      error: null,
    });
    const outcome = await startMerge('ticket-1', client);
    expect(outcome).toEqual({
      kind: 'preview',
      crews: [{ id: 'c1', name: 'Crew', owner: 'anon' }],
      trips: [],
    });
    expect(post).toHaveBeenCalledWith('/v1/auth/merge-ticket', { ticket: 'ticket-1' });
  });

  it('returns ticket_invalid on a 403', async () => {
    const { client } = fakeTicketClient({ data: null, error: { status: 403 } });
    await expect(startMerge('ticket-1', client)).resolves.toEqual({ kind: 'ticket_invalid' });
  });
});

describe('confirmMerge', () => {
  it('merges and runs every registered onSignOut hook in order', async () => {
    const order: string[] = [];
    registerOnSignOut(() => {
      order.push('first');
    });
    registerOnSignOut(() => {
      order.push('second');
    });
    const { client, post } = fakeExecuteClient({
      data: { user: { id: 'existing-uid' } },
      error: null,
    });
    const outcome = await confirmMerge('ticket-1', client);
    expect(outcome).toEqual({ kind: 'merged', userId: 'existing-uid' });
    expect(order).toEqual(['first', 'second']);
    expect(post).toHaveBeenCalledWith('/v1/auth/merge', {
      ticket: 'ticket-1',
      strategy: 'keep_existing',
    });
  });

  it('returns ticket_invalid without running any onSignOut hook on a replayed ticket', async () => {
    const hook = jest.fn<OnSignOutHook>();
    registerOnSignOut(hook);
    const { client } = fakeExecuteClient({ data: null, error: { status: 403 } });
    await expect(confirmMerge('ticket-1', client)).resolves.toEqual({ kind: 'ticket_invalid' });
    expect(hook).not.toHaveBeenCalled();
  });
});
