/**
 * The command client against the real api harness (Testcontainers Postgres + Redis, Better Auth,
 * `/sync/upload` and `/v1/cmd` over loopback HTTP): a rejected queued op rolls back its overlay and
 * shows up in `useRejectedCommands`; an applied one is marked done; online-only commands answer
 * synchronously.
 */
import { generateUuidV7 } from '@cp/domain';
import { afterAll, afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import {
  OVERLAY_CREWS,
  openTestLocalFirst,
  UNREACHABLE,
  type TestLocalFirst,
} from '../../powersync/test-support/local-first-fixture';
import { nodeFetch } from '../../powersync/test-support/node-realm';
import { removeDir } from '../../powersync/test-support/open-node-database';
import { startApiHarness, type ApiHarness } from '../../powersync/test-support/start-api-harness';
import { createFetchTransport } from '../../powersync/transport';
import { listQueuedCommands } from '../../status/use-queued-commands';
import { useRejectedCommands } from '../../status/use-rejected-commands';
import { defineClientCommand } from '../summaries';

jest.mock(
  '@powersync/common',
  () =>
    jest.requireActual<{ powersyncCommon: unknown }>('../../powersync/test-support/node-realm')
      .powersyncCommon,
);

interface CrewPayload {
  crew_id: string;
  name: string;
}
const createCrew = defineClientCommand<CrewPayload>({ name: 'create_test_crew', offline: true });
const rejectOp = defineClientCommand<Record<string, never>>({
  name: 'reject_test_op',
  offline: true,
});
const createCrewNow = defineClientCommand<CrewPayload>({
  name: 'create_test_crew',
  offline: false,
});
const registeredOnly = defineClientCommand<CrewPayload>({
  name: 'create_registered_crew',
  offline: false,
});

let api: ApiHarness;
let stack: TestLocalFirst;

beforeAll(async () => {
  api = await startApiHarness();
}, 240_000);

afterAll(async () => {
  await api?.stop();
});

afterEach(async () => {
  await stack.close();
  removeDir(stack.dir);
});

async function signedInStack(): Promise<TestLocalFirst> {
  const session = await api.signInAnonymously();
  return openTestLocalFirst({
    uid: session.uid,
    holdUploads: true,
    transport: createFetchTransport({
      baseUrl: api.baseUrl,
      sessionHeaders: () => Promise.resolve({ cookie: session.cookie }),
      fetch: nodeFetch,
    }),
  });
}

describe('queued commands against the api', () => {
  it('a rejected op removes its overlay row and appears in useRejectedCommands', async () => {
    stack = await signedInStack();
    const ghostId = generateUuidV7();
    const rejected = await stack.value.commands.send(
      rejectOp,
      {},
      { optimistic: [{ table: OVERLAY_CREWS, row: { id: ghostId, name: 'Never happens' } }] },
    );
    const { result } = await renderHook(() => useRejectedCommands(), { wrapper: stack.wrapper });
    expect(await stack.db.getAll(`SELECT id FROM ${OVERLAY_CREWS}`)).toEqual([{ id: ghostId }]);

    await act(() => stack.value.queue.flush());

    expect(await stack.db.getAll(`SELECT id FROM ${OVERLAY_CREWS}`)).toEqual([]);
    expect(await listQueuedCommands(stack.db)).toEqual([]);
    await waitFor(() =>
      expect(result.current.items).toEqual([
        expect.objectContaining({
          opId: rejected.opId,
          cmd: 'reject_test_op',
          code: 'STATE_INVALID',
          messageKey: 'errors.STATE_INVALID',
          detail: { state: 'closed' },
          summary: { id: 'reject_test_op', message: 'reject_test_op' },
        }),
      ]),
    );

    await act(() => result.current.dismiss(rejected.opId));
    await waitFor(() => expect(result.current.items).toEqual([]));
  });

  it('an applied op is marked done and keeps its overlay until its result syncs', async () => {
    stack = await signedInStack();
    const crew = { crew_id: generateUuidV7(), name: 'Bali' };
    const sent = await stack.value.commands.send(createCrew, crew, {
      optimistic: [{ table: OVERLAY_CREWS, row: { id: crew.crew_id, name: crew.name } }],
    });

    await stack.value.queue.flush();

    expect(await listQueuedCommands(stack.db)).toMatchObject([{ opId: sent.opId, status: 'done' }]);
    expect(await stack.db.getAll(`SELECT id FROM ${OVERLAY_CREWS}`)).toEqual([
      { id: crew.crew_id },
    ]);
    expect(await api.crewCount(crew.crew_id)).toBe(1);
  });
});

describe('online-only commands', () => {
  it('answer with the server result', async () => {
    stack = await signedInStack();
    const crew = { crew_id: generateUuidV7(), name: 'Hoi An' };
    const outcome = await stack.value.commands.send(createCrewNow, crew);
    expect(outcome).toMatchObject({ kind: 'applied', result: { crew_id: crew.crew_id } });
    expect(await listQueuedCommands(stack.db)).toEqual([]);
    expect(await api.crewCount(crew.crew_id)).toBe(1);
  });

  it('answer with the reject code', async () => {
    stack = await signedInStack();
    const outcome = await stack.value.commands.send(registeredOnly, {
      crew_id: generateUuidV7(),
      name: 'Members only',
    });
    expect(outcome).toMatchObject({ kind: 'rejected' });
    expect((outcome as { code: string }).code).toMatch(/^[A-Z_]+$/);
  });

  it('report the server as unavailable when it cannot be reached', async () => {
    stack = await openTestLocalFirst({ transport: UNREACHABLE });
    const outcome = await stack.value.commands.send(createCrewNow, {
      crew_id: generateUuidV7(),
      name: 'Nowhere',
    });
    expect(outcome).toMatchObject({ kind: 'unavailable', code: 'NETWORK' });
  });
});
