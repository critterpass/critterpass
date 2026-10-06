/**
 * Lab scenes for the change set chat card's states and the crew's driver pick, through the same copy as the app, with every
 * handler a no-op.
 */
import type { ReactNode } from 'react';
import { ScrollView } from 'react-native';

import { driverPickDetail, driverPickTitle, type DriverPick } from '@/features/drivers';
import { useLocale } from '@/lib/i18n/use-locale';
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

/** The crew's driver pick in chat: the driver, his days and the terms, while voting and once set. */
function DriverPickCards() {
  const locale = useLocale();
  const pick: DriverPick = {
    name: 'Made',
    days: [
      { date: '2026-10-14', window_start: '08:00', window_end: '18:00', pickup: 'Ubud' },
      { date: '2026-10-15', window_start: '09:00', window_end: '17:00', pickup: 'Ubud' },
    ],
    terms: { price_minor: 70_000_000, currency: 'IDR', price_unit: 'day', included_hours: 10 },
  };
  const detail = driverPickDetail(pick, locale);
  return (
    <Scaffold variant="dark" edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={{ padding: 20, gap: 12 }} testID="plan-driver-pick-cards">
        <ChangesetChatCardView
          title={driverPickTitle({ pick, author: 'Minh', mine: false })}
          detail={detail}
          state="voting"
          yes={1}
          needed={3}
          onDecide={noop}
          onOpen={noop}
        />
        <ChangesetChatCardView
          title={driverPickTitle({ pick, author: null, mine: true })}
          detail={detail}
          state="approved"
          yes={3}
          needed={3}
          onDecide={null}
          onOpen={noop}
        />
      </ScrollView>
    </Scaffold>
  );
}

export const REVIEW_SCENES: Readonly<Record<string, () => ReactNode>> = {
  'review-driver-pick-cards': () => <DriverPickCards />,
  'review-chat-cards': () => <ChatCards />,
};
