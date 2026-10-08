/**
 * The signed-in uid without a read: once the session has bound the database, a screen has the uid
 * on its first render, and it follows the database's owner through a wipe and the next sign-in. A
 * database whose owner row was written before this process read it is followed from the row.
 */
import { afterEach, describe, expect, it } from '@jest/globals';
import { act, renderHook, waitFor } from '@testing-library/react-native';

import { OWNER_UID_KEY } from '../local-tables';
import { bindLocalOwner, resetLocalData } from '../reset';
import { openTestLocalFirst, type TestLocalFirst } from '../test-support/local-first-fixture';
import { removeDir } from '../test-support/open-node-database';
import { useSessionUid } from '../use-session-uid';

const ANA = '0199a1b2-0000-7000-8000-00000000000a';
const BINH = '0199a1b2-0000-7000-8000-00000000000b';

const stacks: TestLocalFirst[] = [];
async function open(): Promise<TestLocalFirst> {
  const stack = await openTestLocalFirst();
  stacks.push(stack);
  return stack;
}

afterEach(async () => {
  for (const stack of stacks.splice(0)) {
    await stack.close().catch(() => undefined);
    removeDir(stack.dir);
  }
});

describe('useSessionUid', () => {
  it('has the uid on the first render once the session has bound the database', async () => {
    const stack = await open();
    await bindLocalOwner(stack.db, stack.value.queue, ANA);
    const seen: Array<string | null> = [];
    const { result } = await renderHook(
      () => {
        const uid = useSessionUid();
        seen.push(uid);
        return uid;
      },
      { wrapper: stack.wrapper },
    );
    expect(seen[0]).toBe(ANA);
    expect(result.current).toBe(ANA);
  });

  it('follows the owner through a sign-out and the next sign-in', async () => {
    const stack = await open();
    await bindLocalOwner(stack.db, stack.value.queue, ANA);
    const { result } = await renderHook(() => useSessionUid(), { wrapper: stack.wrapper });
    expect(result.current).toBe(ANA);

    await act(() => resetLocalData(stack.db, stack.value.queue));
    expect(result.current).toBeNull();

    await act(() => bindLocalOwner(stack.db, stack.value.queue, BINH));
    expect(result.current).toBe(BINH);

    // Binding a database that still holds someone else's data wipes it for the new owner.
    await act(() => bindLocalOwner(stack.db, stack.value.queue, ANA));
    expect(result.current).toBe(ANA);
    // The owner row agrees, and reading it back does not unsettle the value.
    await act(() => new Promise((resolve) => setTimeout(resolve, 150)));
    expect(result.current).toBe(ANA);
  });

  it('follows an owner row written straight to the database', async () => {
    const stack = await open();
    await stack.db.execute('INSERT OR REPLACE INTO local_state (id, value) VALUES (?, ?)', [
      OWNER_UID_KEY,
      ANA,
    ]);
    const { result } = await renderHook(() => useSessionUid(), { wrapper: stack.wrapper });
    await waitFor(() => expect(result.current).toBe(ANA));

    await act(() =>
      stack.db.execute('UPDATE local_state SET value = ? WHERE id = ?', [BINH, OWNER_UID_KEY]),
    );
    await waitFor(() => expect(result.current).toBe(BINH));
  });
});
