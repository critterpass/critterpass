/**
 * The guide's private ask push and its quick replies: the category is registered with both
 * actions opening the app, a reply maps to `answer_availability_ask` for that ask (from the APNs
 * payload on iOS and the FCM data on Android), a reply that cold-started the app is picked up
 * from the last response, and each reply is sent once even when both paths see it. The OS
 * notification centre is the boundary; the command goes through the real client and queue.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@shopify/react-native-skia', () => require('@/ui/test-support/skia-double'));
jest.mock(
  '@powersync/common',
  () =>
    jest.requireActual<{ powersyncCommon: unknown }>('@/data/powersync/test-support/node-realm')
      .powersyncCommon,
);
jest.mock('expo-router', () => ({ useIsFocused: () => true, router: { push: jest.fn() } }));
jest.mock('expo-notifications', () => ({
  setNotificationCategoryAsync: jest.fn(() => Promise.resolve()),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  getLastNotificationResponseAsync: jest.fn(() => Promise.resolve(null)),
  clearLastNotificationResponseAsync: jest.fn(() => Promise.resolve()),
}));

import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';

import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';

import {
  askReplyOf,
  handleAskReply,
  registerSetupNotificationCategory,
  resetAskRepliesForTests,
  SETUP_ASK_CATEGORY,
  SetupNotificationActions,
} from '../notifications';
import { TRIP_ID } from '../scenes/fixtures';
import { renderSetup } from '../test-support/setup-harness';

const ASK_ID = '0199a6f0-0000-7000-8000-00000000f001';

function response(
  action: string,
  trigger: unknown,
  category: string = SETUP_ASK_CATEGORY,
): Notifications.NotificationResponse {
  return {
    actionIdentifier: action,
    notification: {
      date: 0,
      request: {
        identifier: 'n-1',
        content: { categoryIdentifier: category, data: {} },
        trigger,
      },
    },
  } as unknown as Notifications.NotificationResponse;
}

const CP = { trip_id: TRIP_ID, ctx: { ask_id: ASK_ID, actions: ['freed', 'not_movable'] } };
const IOS = { type: 'push', payload: { aps: {}, cp: CP } };
const ANDROID = { type: 'push', remoteMessage: { data: { cp: JSON.stringify(CP) } } };

// Real encrypted databases and queues: CI runners are about three times slower than a laptop.
jest.setTimeout(60_000);

let stack: TestLocalFirst | null = null;

afterEach(async () => {
  await stack?.close();
  if (stack) removeDir(stack.dir);
  stack = null;
  resetAskRepliesForTests();
  jest.clearAllMocks();
});

describe('ask push quick replies', () => {
  it('registers both replies under the ask category, each opening the app', async () => {
    const write = jest.fn(() => Promise.resolve());
    await registerSetupNotificationCategory(
      { freed: 'Freed it', notMovable: 'Can’t move it' },
      write,
    );
    expect(write).toHaveBeenCalledWith('cp.setup_ask', [
      { identifier: 'freed', buttonTitle: 'Freed it', options: { opensAppToForeground: true } },
      {
        identifier: 'not_movable',
        buttonTitle: 'Can’t move it',
        options: { opensAppToForeground: true },
      },
    ]);
  });

  it('reads the ask from the iOS payload and the Android data', () => {
    expect(askReplyOf(response('freed', IOS))).toMatchObject({
      answer: 'freed',
      askId: ASK_ID,
      tripId: TRIP_ID,
    });
    expect(askReplyOf(response('not_movable', ANDROID))).toMatchObject({
      answer: 'not_movable',
      askId: ASK_ID,
    });
  });

  it('ignores a plain tap, another category and a payload without an ask', () => {
    expect(askReplyOf(response('expo.modules.notifications.actions.DEFAULT', IOS))).toBeNull();
    expect(askReplyOf(response('freed', IOS, 'cp.generic'))).toBeNull();
    expect(askReplyOf(response('freed', { type: 'push', payload: { cp: {} } }))).toBeNull();
  });

  it('sends each reply once', async () => {
    const send = jest.fn(() => Promise.resolve());
    const open = jest.fn();
    const reply = askReplyOf(response('freed', IOS));
    await handleAskReply(reply, { send, open });
    await handleAskReply(reply, { send, open });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({ ask_id: ASK_ID, answer: 'freed' });
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('queues the answer from a reply that cold-started the app and opens the ask sheet', async () => {
    // Uploads held: the reply only has to reach the queue, never the network.
    stack = await openTestLocalFirst({ holdUploads: true });
    jest
      .mocked(Notifications.getLastNotificationResponseAsync)
      .mockResolvedValueOnce(response('not_movable', IOS));
    await renderSetup(<SetupNotificationActions />, { stack });

    await waitFor(async () => {
      const rows = await stack!.db.getAll<{ cmd: string; envelope: string }>(
        'SELECT cmd, envelope FROM commands',
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]?.cmd).toBe('answer_availability_ask');
      expect((JSON.parse(rows[0]?.envelope ?? '{}') as { payload: unknown }).payload).toEqual({
        ask_id: ASK_ID,
        answer: 'not_movable',
      });
    });
    // The sheet opens once the answer is queued, a tick after the row lands.
    await waitFor(() =>
      expect(router.push).toHaveBeenCalledWith({
        pathname: '/[tripId]/setup/ask/[askId]',
        params: { tripId: TRIP_ID, askId: ASK_ID, answered: 'not_movable' },
      }),
    );
    expect(Notifications.setNotificationCategoryAsync).toHaveBeenCalledWith(
      'cp.setup_ask',
      expect.any(Array),
    );
  });
});
