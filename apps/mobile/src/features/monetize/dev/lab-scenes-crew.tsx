/**
 * The crew-facing lab scenes: the crew's boost card and its states (4c-1) and the seventh-seat
 * sheet (4f-1), over fixed rows.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture names, places and ids, never shipped copy. */
import type { ReactNode } from 'react';
import { ScrollView } from 'react-native';

import { Scaffold } from '@/ui/surface/Scaffold';

import {
  boostCardModel,
  type CardBoost,
  type CardInput,
  type CardPayment,
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
  createdAt: '2027-03-20T10:00:00Z',
  ...over,
});

const SHARES = CREW.map((name) => ({ userId: uid(name), name, minor: 200, currency: 'USD' }));

const paid = (name: string): CardPayment => ({
  fromId: uid(name),
  toId: uid('Winston'),
  status: 'confirmed',
  createdAt: '2027-03-21T10:00:00Z',
});

const GUIDE = { id: 'tokek', name: 'Tokek', line: 'No more counting. Who wants a day back?' };

function Card(over: Partial<CardInput> & { readonly guide?: boolean }) {
  const model = boostCardModel({
    viewerUid: uid('Rin'),
    boost: boost(),
    shares: SHARES,
    payments: [paid('Maya'), paid('Jordan')],
    ...over,
  });
  return (
    <Scaffold variant="dark" edges={['top', 'bottom']} testID="boost-card-scene">
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <BoostCardView
          model={model}
          buyer="Winston"
          destination="Kyoto"
          dates="Apr 2–16"
          perks={['∞ redrafts', 'Live map', 'Unlimited guide', 'Up to 16']}
          share={model.kind === 'live' && model.share !== null ? '$2' : null}
          guide={over.guide === false ? null : GUIDE}
          onSettle={noop}
          onThanks={noop}
        />
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
        onDismiss={noop}
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
    <Card boost={boost({ split: false, splitMemberIds: [] })} shares={[]} payments={[]} />
  ),
  '4c-1-split-pending': () => <Card shares={[]} payments={[]} />,
  '4c-1-all-square': () => <Card payments={CREW.slice(1).map(paid)} />,
  '4c-1-refunded': () => <Card boost={boost({ status: 'revoked' })} guide={false} />,
  '4f-1-seat-cap': () => <SeatCap price />,
  '4f-1-no-price': () => <SeatCap price={false} />,
};
