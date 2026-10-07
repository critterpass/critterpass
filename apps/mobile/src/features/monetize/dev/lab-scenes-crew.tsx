/**
 * The crew-facing lab scenes: the crew's boost card and its states (4c-1), each inside the chat it
 * is posted to as the render sets it, and the seventh-seat sheet (4f-1), over fixed rows.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture names, places and ids, never shipped copy. */
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { ScrollView } from 'react-native';

import { ChatMessage } from '@/ui/chat/ChatMessage';
import { Stack } from '@/ui/layout/Stack';
import { Avatar } from '@/ui/people/Avatar';
import { Scaffold } from '@/ui/surface/Scaffold';

import {
  boostCardModel,
  type CardBoost,
  type CardInput,
  type CardLedgerEntry,
} from '../boost-card/boost-card-model';
import { BoostCardView } from '../boost-card/boost-card-view';
import { SeatCapView } from '../seat-cap/seat-cap-view';
import { noop } from './lab-fixtures';

const CREW = ['Winston', 'Maya', 'Jordan', 'Rin', 'Dev', 'Alex'];
const uid = (name: string) => `u-${name.toLowerCase()}`;

const boost = (over: Partial<CardBoost> = {}): CardBoost => ({
  id: 'b1',
  buyerId: uid('Winston'),
  status: 'active',
  split: true,
  splitMemberIds: CREW.map(uid),
  thankedBy: [],
  ...over,
});

const SHARES = CREW.map((name) => ({ userId: uid(name), name, minor: 200, currency: 'USD' }));

const EXPENSE = { id: 'e1', ledgerCurrency: 'USD' };
const move = (from: string, to: string, kind: string): CardLedgerEntry => ({
  debtorId: uid(from),
  creditorId: uid(to),
  minor: 200,
  currency: 'USD',
  sourceKind: kind,
  sourceId: kind === 'payment' ? `p-${from}` : EXPENSE.id,
});
const IOUS = CREW.slice(1).map((name) => move(name, 'Winston', 'boost_iou'));
/** A confirmed payment of the share: the buyer hands the IOU back. */
const paid = (name: string) => move('Winston', name, 'payment');

const GUIDE = { id: 'pon', name: 'Pon', line: 'No more counting. Who wants a day back?' };

function Card(
  over: Partial<CardInput> & { readonly guide?: boolean; readonly after?: ReactNode } = {},
) {
  const model = boostCardModel({
    viewerUid: uid('Rin'),
    boost: boost(),
    expense: EXPENSE,
    shares: SHARES,
    ledger: [...IOUS, paid('Maya'), paid('Jordan')],
    payments: [],
    ...over,
  });
  return (
    <Scaffold variant="dark" edges={['top', 'bottom']} testID="boost-card-scene">
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <Stack gap="12">
          <ChatMessage kind="divider" text="Today" />
          <ChatMessage
            kind="theirs"
            author="Dev"
            text="pon only gave us 3 redrafts, we used them all on day 2 😅"
            avatar={<Avatar name="Dev" size="sm" decorative />}
          />
          <BoostCardView
            model={model}
            buyer="Winston"
            destination="Kyoto"
            dates="Apr 2–16"
            perks={['∞ redrafts', 'Live map', 'Unlimited Pon', 'Up to 16']}
            share={model.kind === 'live' && model.share !== null ? '$2' : null}
            guide={over.guide === false ? null : GUIDE}
            onSettle={noop}
            onThanks={noop}
          />
          {over.after ?? (
            <ChatMessage
              kind="theirs"
              author="Maya"
              text="thank you W!! paying you back now"
              avatar={<Avatar name="Maya" size="sm" decorative />}
            />
          )}
        </Stack>
      </ScrollView>
    </Scaffold>
  );
}

function SeatCap({ price }: { readonly price: boolean }) {
  return (
    <Scaffold variant="dark" edges={['top', 'bottom']} testID="seat-cap-scene">
      <SeatCapView
        destination="Kyoto"
        cap={6}
        seats={CREW.map((name) => ({ uid: uid(name), name }))}
        invitee="Sam"
        price={price ? '$12' : null}
        each={price ? '$1.72' : null}
        ways={7}
        onBoost={noop}
        onKeep={noop}
        // Closing the sheet leaves the scene, so one back returns to the lab's list.
        onDismiss={() => router.back()}
      />
    </Scaffold>
  );
}

export const CREW_SCENES: Readonly<Record<string, () => ReactNode>> = {
  '4c-1-boost-card': () => <Card />,
  '4c-1-buyer': () => <Card viewerUid={uid('Winston')} />,
  '4c-1-settled-thanked': () => (
    <Card viewerUid={uid('Maya')} boost={boost({ thankedBy: [uid('Maya')] })} />
  ),
  '4c-1-covered': () => (
    <Card
      boost={boost({ split: false, splitMemberIds: [] })}
      expense={null}
      shares={[]}
      ledger={[]}
    />
  ),
  '4c-1-split-pending': () => <Card expense={null} shares={[]} ledger={[]} />,
  '4c-1-all-square': () => <Card ledger={[...IOUS, ...CREW.slice(1).map(paid)]} />,
  '4c-1-refunded': () => (
    <Card
      boost={boost({ status: 'revoked' })}
      guide={false}
      after={
        <>
          <ChatMessage
            kind="theirs"
            author="Winston"
            text="the refund came through, so nobody owes me anything for it"
            avatar={<Avatar name="Winston" size="sm" decorative />}
          />
          <ChatMessage kind="mine" text="ok! back to 3 redrafts then, let's pick carefully" />
        </>
      }
    />
  ),
  '4f-1-seat-cap': () => <SeatCap price />,
  '4f-1-no-price': () => <SeatCap price={false} />,
};
