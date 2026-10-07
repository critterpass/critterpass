/**
 * A problem report's screenshot never shows what crewmates wrote: with the mask up, the body of
 * every bubble (text, and whatever a card draws) sits under a cover, the author's name does not.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@shopify/react-native-skia', () => require('@/ui/test-support/skia-double'));
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- see the double's header
jest.mock('@/ui/sticker/Sticker', () => require('@/ui/avatar/test-support/sticker-double'));
jest.mock(
  '@powersync/common',
  () =>
    jest.requireActual<{ powersyncCommon: unknown }>('@/data/powersync/test-support/node-realm')
      .powersyncCommon,
);
jest.mock('expo-router', () => ({
  useIsFocused: () => true,
  router: { replace: () => undefined, back: () => undefined, push: () => undefined },
}));

import { describe, expect, it, jest } from '@jest/globals';
import { screen } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { isCovered, whileMasked } from '@/features/help/shake/test-support/masked';
import { ScreenJoltProvider } from '@/motion/patterns/thud';
import { renderUi } from '@/ui/test-support/render';

import type { ChatMessage } from '@/features/crew/chat/data/rows';
import { Bubble } from '@/features/crew/chat/components/bubble';

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function framed(node: ReactNode): ReactElement {
  return (
    <SafeAreaProvider initialMetrics={METRICS}>
      <ScreenJoltProvider>{node}</ScreenJoltProvider>
    </SafeAreaProvider>
  );
}

function message(over: Partial<ChatMessage>): ChatMessage {
  return {
    id: 'm1',
    crewId: 'c1',
    seq: 1,
    senderKind: 'user',
    senderId: 'u-maya',
    senderName: 'Maya Tan',
    guideId: null,
    type: 'text',
    body: 'The villa code is 4471, do not share it',
    refKind: null,
    refId: null,
    replyToId: null,
    mentions: [],
    mentionsGuide: false,
    attachments: [],
    edited: false,
    deleted: false,
    createdAt: '2026-10-07T03:00:00.000Z',
    status: 'sent',
    ...over,
  };
}

describe('crew chat in a problem report screenshot', () => {
  it('covers what a crewmate and the member wrote, not who wrote it', async () => {
    await renderUi(
      framed(
        <>
          <Bubble message={message({})} mine={false} first last joinIndex={1} />
          <Bubble
            message={message({ id: 'm2', senderId: 'u-me', body: 'Got it, see you at 7' })}
            mine
            first
            last
            joinIndex={0}
          />
        </>,
      ),
    );
    expect(screen.queryByTestId('private-content-cover')).toBeNull();
    await whileMasked(() => {
      expect(isCovered(screen.getByText('The villa code is 4471, do not share it'))).toBe(true);
      expect(isCovered(screen.getByText('Got it, see you at 7'))).toBe(true);
      expect(isCovered(screen.getByText('MAYA'))).toBe(false);
    });
  });

  it('covers a photo, voice note or card body', async () => {
    await renderUi(
      framed(
        <Bubble
          message={message({ type: 'photo', body: '' })}
          mine={false}
          first
          last
          joinIndex={1}
          renderBody={() => <View testID="photo-body" />}
        />,
      ),
    );
    await whileMasked(() => {
      expect(isCovered(screen.getByTestId('photo-body'))).toBe(true);
    });
  });
});
