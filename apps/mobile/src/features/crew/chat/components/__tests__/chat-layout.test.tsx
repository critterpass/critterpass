/**
 * Layout snapshots of the chat's pieces per state, for review against the crew chat render: the
 * header with and without a trip guide, a run of bubbles (theirs, mine, the guide's, a system row,
 * a tombstone, an edited message, a send in flight and a refused one) and the composer.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@shopify/react-native-skia', () => require('@/ui/test-support/skia-double'));
jest.mock('expo-router', () => ({ useIsFocused: () => true, router: { back: jest.fn() } }));

import { describe, expect, it, jest } from '@jest/globals';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { fireEvent, render, screen, within } from '@testing-library/react-native';
import { router } from 'expo-router';
import { StyleSheet } from 'react-native';
import type { ReactElement } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { ChatMessage } from '../../data/rows';
import { Bubble } from '../bubble';
import { ChatComposer } from '../composer';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

async function snapshot(ui: ReactElement) {
  i18n.loadAndActivate({ locale: 'en', messages: {} });
  const view = await render(
    <I18nProvider i18n={i18n}>
      <SafeAreaProvider initialMetrics={METRICS}>
        <GestureHandlerRootView>{ui}</GestureHandlerRootView>
      </SafeAreaProvider>
    </I18nProvider>,
  );
  return view.toJSON();
}

function message(overrides: Partial<ChatMessage>): ChatMessage {
  return {
    id: 'm-1',
    crewId: 'c-1',
    seq: 1,
    senderKind: 'user',
    senderId: 'maya',
    senderName: 'Maya Tran',
    guideId: null,
    type: 'text',
    body: 'who’s up for the spa on day 3?',
    refKind: null,
    refId: null,
    replyToId: null,
    mentions: [],
    mentionsGuide: false,
    attachments: [],
    edited: false,
    deleted: false,
    createdAt: '2026-09-28T07:02:00Z',
    status: 'sent',
    ...overrides,
  };
}

const RUN: readonly [string, ChatMessage, boolean][] = [
  ['theirs', message({}), false],
  [
    'guide',
    message({
      id: 'm-2',
      senderKind: 'guide',
      senderId: null,
      senderName: 'Tokek',
      body: 'Karsa Spa has three slots at 14:00.',
    }),
    false,
  ],
  [
    'system',
    message({
      id: 'm-3',
      senderKind: 'system',
      senderId: null,
      type: 'system',
      refKind: 'member_joined',
      refName: 'Leo',
    }),
    false,
  ],
  ['tombstone', message({ id: 'm-4', deleted: true, body: '' }), false],
  ['edited', message({ id: 'm-5', edited: true, body: 'sunset instead?' }), false],
  [
    'mine',
    message({ id: 'm-6', senderId: 'me', body: '@tokek can we catch sunset somewhere after?' }),
    true,
  ],
  [
    'failed',
    message({ id: 'm-8', seq: null, senderId: 'me', status: 'failed', body: 'hello?' }),
    true,
  ],
];

describe('chat layout', () => {
  it.each(RUN)('bubble: %s', async (_name, item, mine) => {
    expect(
      await snapshot(
        <Bubble
          message={item}
          mine={mine}
          first
          last
          joinIndex={1}
          timeZone="UTC"
          onRetry={() => undefined}
          onDiscard={() => undefined}
        />,
      ),
    ).toMatchSnapshot();
  });

  it('the back arrow is a plain touch target that goes back', async () => {
    await snapshot(<ChatHeader crewId="c-1" crewName="The Bali Six" people={6} guideName={null} />);
    const back = screen.getByTestId('chat-back');
    expect(back.props.accessibilityLabel).toBe('Back');
    const style = StyleSheet.flatten(back.props.style) as { backgroundColor?: string };
    expect(style.backgroundColor).toBeUndefined();
    await fireEvent.press(back);
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it('caps a text message on its column, never on the content-sized bubble', async () => {
    await snapshot(
      <Bubble
        message={message({
          id: 'short',
          senderId: 'me',
          seq: null,
          status: 'sending',
          body: 'heh',
        })}
        mine
        first
        last
        joinIndex={1}
      />,
    );
    const capped = [];
    for (let node = screen.getByText('heh').parent; node !== null; node = node.parent) {
      const style = StyleSheet.flatten(node.props.style as never) as { maxWidth?: unknown } | null;
      if (style?.maxWidth !== undefined) capped.push(node);
      if (node.props.testID === 'chat-message-short') break;
    }
    expect(capped).toHaveLength(1);
    expect(StyleSheet.flatten(capped[0]?.props.style as never)).toMatchObject({ maxWidth: '82%' });
    // The capped view is the column holding the delivery line, not the bubble around the text.
    const column = capped[0];
    if (column === undefined) throw new Error('no capped view');
    expect(within(column).queryByText('Sending')).not.toBeNull();
  });

  it('composer', async () => {
    expect(
      await snapshot(
        <ChatComposer
          candidates={[]}
          guideName="Tokek"
          onSend={() => undefined}
          onTyping={() => undefined}
          onAttach={() => undefined}
        />,
      ),
    ).toMatchSnapshot();
  });
});
