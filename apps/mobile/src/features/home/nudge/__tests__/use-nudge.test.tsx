/**
 * `useNudge` against the api's answers (the transport replays `send_nudge` / `act_inbox_item`
 * bodies in the wire shape the api's own suites assert): each typed outcome, the toast that names
 * the guide, the crewmate and the hour, the share sheet for a crewmate without the app, the pair
 * cooldown, and app opens counted once per local hour.
 */
jest.mock(
  '@powersync/common',
  () =>
    jest.requireActual<{ powersyncCommon: unknown }>('@/data/powersync/test-support/node-realm')
      .powersyncCommon,
);

import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { Share } from 'react-native';

import type { TransportResponse } from '@/data/powersync/transport';
import { LocalFirstProvider } from '@/data/powersync/local-first-context';
import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';
import { OWNER_UID_KEY } from '@/data/powersync/local-tables';
import { toastQueue } from '@/motion/island-toast';

import { queued } from '../../test-support/home-harness';
import { useNudge } from '../use-nudge';
import { hourKey, useRecordAppOpen } from '../use-record-app-open';

const DEV = '0192f000-0000-7000-8000-0000000000b2';
let stack: TestLocalFirst | null = null;

function answering(status: number, body: unknown) {
  const calls: { path: string; body: unknown }[] = [];
  return {
    calls,
    transport: {
      postJson(path: string, sent: unknown): Promise<TransportResponse> {
        calls.push({ path, body: sent });
        return Promise.resolve({ status, body } as TransportResponse);
      },
    },
  };
}

async function hook<T>(result: () => T, transport?: ReturnType<typeof answering>['transport']) {
  stack = await openTestLocalFirst({ holdUploads: true, ...(transport ? { transport } : {}) });
  const value = stack.value;
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <I18nProvider i18n={i18n}>
      <LocalFirstProvider value={value}>{children}</LocalFirstProvider>
    </I18nProvider>
  );
  return renderHook(result, { wrapper });
}

afterEach(async () => {
  toastQueue.dismiss();
  jest.restoreAllMocks();
  await stack?.close();
  if (stack) removeDir(stack.dir);
  stack = null;
});

const GUIDE = { slug: 'pon', name: 'Pon' };

describe('useNudge', () => {
  it('reports the scheduled hour in a toast', async () => {
    const api = answering(200, {
      status: 'applied',
      result: {
        outcome: 'scheduled',
        nudge_id: 'n-1',
        send_at: '2026-09-29T14:00:00.000Z',
        send_at_local: '21:00',
        tz: 'Asia/Ho_Chi_Minh',
        guide: GUIDE,
        target_name: 'Dev',
      },
    });
    const { result } = await hook(() => useNudge(), api.transport);
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.nudge({ target_uid: DEV, reason: 'rsvp' });
    });
    expect(outcome).toEqual({ kind: 'scheduled', at: '21:00', guide: 'Pon', name: 'Dev' });
    expect(api.calls[0]?.path).toBe('/v1/cmd/send_nudge');
    expect(toastQueue.getCurrent()?.title).toBe(
      'Pon will nudge Dev at 21:00, when they open things.',
    );
  });

  it('says the nudge waits in the inbox when they have no push', async () => {
    const api = answering(200, {
      status: 'applied',
      result: { outcome: 'inbox', nudge_id: 'n-2', guide: GUIDE, target_name: 'Rin' },
    });
    const { result } = await hook(() => useNudge(), api.transport);
    await act(async () => {
      await result.current.nudge({ target_uid: DEV, reason: 'vote' });
    });
    expect(toastQueue.getCurrent()?.title).toBe('Pon left Rin a nudge in their inbox.');
  });

  it('opens the share sheet for a crewmate who never installed the app', async () => {
    const share = jest
      .spyOn(Share, 'share')
      .mockResolvedValue({ action: Share.sharedAction, activityType: undefined });
    const api = answering(200, {
      status: 'applied',
      result: {
        outcome: 'relay',
        relay: 'share_sheet',
        nudge_id: 'n-3',
        text: 'Winston and Pon are saving you a spot in Kyoto Crew on CritterPass.',
        url: 'https://go.critterpass.app/i/KQ7M3P',
        guide: GUIDE,
        target_name: 'Alex',
      },
    });
    const { result } = await hook(() => useNudge(), api.transport);
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.nudge({ target_uid: DEV, reason: 'invite_open' });
    });
    expect(outcome).toMatchObject({ kind: 'relay', url: 'https://go.critterpass.app/i/KQ7M3P' });
    expect(share).toHaveBeenCalledWith({
      message: 'Your crew is saving you a spot on CritterPass. https://go.critterpass.app/i/KQ7M3P',
      url: 'https://go.critterpass.app/i/KQ7M3P',
    });
    expect(toastQueue.getCurrent()).toBeNull();
  });

  it('answers too_soon with the next time the pair may nudge, from the synced nudge', async () => {
    const api = answering(429, {
      error: { code: 'NUDGE_TOO_SOON', message: 'NUDGE_TOO_SOON', retryable: false },
    });
    const { result } = await hook(() => useNudge(), api.transport);
    const s = stack;
    if (s === null) throw new Error('no stack');
    await s.db.execute('INSERT OR REPLACE INTO local_state (id, value) VALUES (?, ?)', [
      OWNER_UID_KEY,
      s.uid,
    ]);
    await s.db.execute(
      `INSERT INTO nudges (id, sender_id, target_id, reason, channel, created_at)
       VALUES ('n-5', ?, ?, 'vote', 'push', '2026-09-29 03:00:00Z')`,
      [s.uid, DEV],
    );
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.nudge({ target_uid: DEV, reason: 'vote' });
    });
    expect(outcome).toEqual({ kind: 'too_soon', nextAt: new Date('2026-09-30T03:00:00Z') });
    expect(toastQueue.getCurrent()?.title).toMatch(/^You nudged them recently\. Try again after /);
  });

  it('reads the nudge result through an inbox answer', async () => {
    const api = answering(200, {
      status: 'applied',
      result: {
        item_id: 'i-1',
        action: 'nudge',
        outcome: 'resolved',
        result: { outcome: 'inbox', nudge_id: 'n-4', guide: GUIDE, target_name: 'Dev' },
      },
    });
    const { result } = await hook(() => useNudge(), api.transport);
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.nudgeFromInbox('i-1', 'nudge');
    });
    expect(outcome).toEqual({ kind: 'inbox', guide: 'Pon', name: 'Dev' });
    expect(api.calls[0]?.path).toBe('/v1/cmd/act_inbox_item');
  });
});

describe('useRecordAppOpen', () => {
  it('counts an open once per local hour', async () => {
    const at = new Date(2026, 8, 29, 21, 5);
    const { rerender } = await hook(() => useRecordAppOpen(() => at));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    await rerender({});
    const s = stack;
    if (s === null) throw new Error('no stack');
    expect(await queued(s, 'record_app_open')).toEqual([{ hour_local: 21 }]);
    expect(hourKey(at)).toBe(hourKey(new Date(2026, 8, 29, 21, 59)));
    expect(hourKey(at)).not.toBe(hourKey(new Date(2026, 8, 29, 22, 0)));
  });
});
