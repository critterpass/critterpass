/**
 * Lab scenes for the change set chat card's states, through the same copy as the app, with every
 * handler a no-op.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab. */
import type { ReactNode } from 'react';
import { ScrollView } from 'react-native';

import { Scaffold } from '@/ui/surface/Scaffold';

import { ChangesetChatCardView } from '../changeset-chat-card';
import { reviewTitle } from '../review-copy';

const noop = () => undefined;

function ChatCards() {
  const title = reviewTitle('weather', 4);
  return (
    <Scaffold variant="dark" edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 12 }} testID="plan-chat-cards">
        <ChangesetChatCardView
          title={title}
          state="voting"
          yes={2}
          needed={4}
          onDecide={noop}
          onOpen={noop}
        />
        <ChangesetChatCardView
          title={title}
          state="approved"
          yes={4}
          needed={4}
          onDecide={null}
          onOpen={noop}
        />
        <ChangesetChatCardView
          title={title}
          state="rejected"
          yes={1}
          needed={4}
          onDecide={null}
          onOpen={noop}
        />
        <ChangesetChatCardView
          title={title}
          state="expired"
          yes={2}
          needed={4}
          onDecide={null}
          onOpen={noop}
        />
        <ChangesetChatCardView
          title={title}
          state="stale"
          yes={0}
          needed={4}
          onDecide={null}
          onOpen={noop}
        />
      </ScrollView>
    </Scaffold>
  );
}

export const REVIEW_SCENES: Readonly<Record<string, () => ReactNode>> = {
  'review-chat-cards': () => <ChatCards />,
};
