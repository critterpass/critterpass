/**
 * Food and access needs over the real local-first stack: the owner's copy comes from the private
 * read (and goes when the server has none), sharing queues the consent before the profile,
 * stopping withdraws the consent (which deletes the crew's flags), and the consent row decides
 * whether sharing must ask first.
 */

import { afterEach, describe, expect, it } from '@jest/globals';
import { act, configure, renderHook, waitFor } from '@testing-library/react-native';

import type { PrivateDietaryWire } from '@cp/domain';

import { OWNER_UID_KEY } from '@/data/powersync/local-tables';
import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';

import {
  EMPTY_PROFILE,
  refreshDietary,
  useDietary,
  useSaveDietary,
  type DietaryServices,
} from '../dietary-data';

configure({ asyncUtilTimeout: 5000 });

/** `GET /v1/me/private/dietary` as the api answers it. */
const STORED: PrivateDietaryWire = {
  diet: 'vegetarian',
  allergies: ['peanuts'],
  avoid: ['coriander'],
  spice: 'mild',
  accessibility_notes: 'No long stairs',
  visibility: 'self',
  consent_at: null,
  updated_at: '2026-09-30T06:00:00.000Z',
};

const stacks: TestLocalFirst[] = [];
afterEach(async () => {
  for (const stack of stacks.splice(0)) {
    await stack.close().catch(() => undefined);
    removeDir(stack.dir);
  }
});

async function open(): Promise<TestLocalFirst> {
  const stack = await openTestLocalFirst({ holdUploads: true });
  stacks.push(stack);
  await stack.db.execute('INSERT OR REPLACE INTO local_state (id, value) VALUES (?, ?)', [
    OWNER_UID_KEY,
    stack.uid,
  ]);
  return stack;
}

async function queued(stack: TestLocalFirst) {
  const rows = await stack.db.getAll<{ cmd: string; envelope: string }>(
    'SELECT cmd, envelope FROM commands ORDER BY seq',
  );
  return rows.map((row) => ({
    cmd: row.cmd,
    payload: (JSON.parse(row.envelope) as { payload: Record<string, unknown> }).payload,
  }));
}

describe('the owner copy', () => {
  it('stores what the server has, and forgets it when there is none', async () => {
    const stack = await open();
    const read: { value: Awaited<ReturnType<DietaryServices['read']>> } = {
      value: { kind: 'ok', value: STORED },
    };
    const services: DietaryServices = { read: () => Promise.resolve(read.value) };
    const { result } = await renderHook(() => useDietary(), { wrapper: stack.wrapper });
    await refreshDietary(stack.db, services, new Date());
    await waitFor(() =>
      expect(result.current.profile).toEqual({
        diet: 'vegetarian',
        allergies: ['peanuts'],
        avoid: ['coriander'],
        spice: 'mild',
        accessibility_notes: 'No long stairs',
        visibility: 'self',
      }),
    );
    read.value = { kind: 'offline' };
    await refreshDietary(stack.db, services, new Date());
    expect(result.current.profile?.diet).toBe('vegetarian');
    read.value = { kind: 'not_set' };
    await refreshDietary(stack.db, services, new Date());
    await waitFor(() => expect(result.current.profile).toBeNull());
  });

  it('reads the dietary consent from the synced consents', async () => {
    const stack = await open();
    const { result } = await renderHook(() => useDietary(), { wrapper: stack.wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.consented).toBe(false);
    await stack.db.execute(
      "INSERT INTO consents (id, user_id, purpose, granted_at) VALUES ('c1', ?, 'dietary_visibility', '2026-09-30T06:00:00Z')",
      [stack.uid],
    );
    await waitFor(() => expect(result.current.consented).toBe(true));
  });
});

describe('saving', () => {
  it('queues the consent before the shared profile, and withdraws it to stop sharing', async () => {
    const stack = await open();
    const { result } = await renderHook(() => useSaveDietary(), { wrapper: stack.wrapper });
    const shared = { ...EMPTY_PROFILE, diet: 'vegan' as const, visibility: 'crew_flags' as const };
    await act(() => result.current.save(shared, { grantConsent: true }));
    await act(() => result.current.stopSharing(shared));
    expect(await queued(stack)).toEqual([
      {
        cmd: 'set_consent',
        payload: { purpose: 'dietary_visibility', granted: true, copy_version: 'dietary-2026-09' },
      },
      { cmd: 'set_dietary_profile', payload: shared },
      {
        cmd: 'set_consent',
        payload: { purpose: 'dietary_visibility', granted: false, copy_version: 'dietary-2026-09' },
      },
      { cmd: 'set_dietary_profile', payload: { ...shared, visibility: 'self' } },
    ]);
    const [row] = await stack.db.getAll<{ data: string }>(
      "SELECT data FROM local_private WHERE id = 'dietary'",
    );
    expect(JSON.parse(row?.data ?? '{}')).toMatchObject({ diet: 'vegan', visibility: 'self' });
  });
});
