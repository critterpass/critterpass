/**
 * A problem report's screenshot never shows what crewmates wrote: with the mask up, the body of
 * every bubble (text, and whatever a card draws) sits under a cover, the author's name does not.
 */

import { describe, expect, it } from '@jest/globals';
import { screen } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { isCovered, whileMasked } from '@/features/help/shake/test-support/masked';
import { ScreenJoltProvider } from '@/motion/patterns/thud';
import { renderUi } from '@/ui/test-support/render';

import type { ChatMessage } from '@/features/crew/chat/data/rows';
import { PremiumMessageRow, type MessageRowProps } from '@/features/crew/premium/chat/message-row';
import { registerPremiumChatCard } from '@/features/crew/premium/chat/cards/registry';

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

const NO_HANDLERS: MessageRowProps['handlers'] = {
  onLongPress: () => undefined,
  onRetry: () => undefined,
  onDiscard: () => undefined,
  onToggleReaction: () => undefined,
  onShowReactions: () => undefined,
};

function Row({ message: m, mine }: { readonly message: ChatMessage; readonly mine: boolean }) {
  return (
    <PremiumMessageRow
      message={m}
      mine={mine}
      first
      last
      senderName={m.senderName ?? ''}
      senderColor="#e8a33d"
      guideName="Tokek"
      readBy={0}
      animate={false}
      readOnly={false}
      repliedTo={undefined}
      repliedToColor={undefined}
      reactions={[]}
      handlers={NO_HANDLERS}
    />
  );
}

describe('crew chat in a problem report screenshot', () => {
  it('covers what a crewmate and the member wrote, not who wrote it', async () => {
    await renderUi(
      framed(
        <>
          <Row message={message({})} mine={false} />
          <Row
            message={message({ id: 'm2', senderId: 'u-me', body: 'Got it, see you at 7' })}
            mine
          />
        </>,
      ),
    );
    expect(screen.queryByTestId('private-content-cover')).toBeNull();
    await whileMasked(() => {
      expect(isCovered(screen.getByText('The villa code is 4471, do not share it'))).toBe(true);
      expect(isCovered(screen.getByText('Got it, see you at 7'))).toBe(true);
      expect(isCovered(screen.getByText('Maya Tan'))).toBe(false);
    });
  });

  it('covers a photo, voice note or card body', async () => {
    const stop = registerPremiumChatCard('photo', { render: () => <View testID="photo-body" /> });
    try {
      await renderUi(framed(<Row message={message({ type: 'photo', body: '' })} mine={false} />));
    } finally {
      stop();
    }
    await whileMasked(() => {
      expect(isCovered(screen.getByTestId('photo-body'))).toBe(true);
    });
  });
});
