/** Proposal lab scenes for a trailer slide (3f-2), a dropout's change list (3f-7) and the crowd sheet (4f-1). */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab. */
import { SEAT_CAP_FREE } from '@cp/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { CrowdSheet } from '../crowd/crowd-sheet';
import type { RsvpStatus } from '../data/trip';
import { DropoutView } from '../dropout/dropout-view';
import { TrailerSlide } from '../trailer/trailer-slide';
import { LAB_PEOPLE } from './lab-fixtures';
import { Dismissable } from './dismissable';

const noop = () => undefined;

const dropout = (resolved: boolean) => (
  <DropoutView
    name="An"
    joinIndex={3}
    guideName="Chà Vá"
    replyLine="An told the crew they can’t make it · Oct 1, 10:05"
    rows={[
      { key: 'r1', title: 'Room 2', before: 'Minh, An', after: 'released' },
      { key: 'r2', title: 'Hội An homestay', before: 'split 4 ways', after: 'split 3' },
      { key: 'r3', title: 'Bà Nà Hills tickets', before: null, after: 'An’s entry is withdrawn' },
    ]}
    share={{ after: '₫4,550,000', before: '₫4,200,000', each: '+₫350,000' }}
    keepInChat
    resolved={resolved}
    onBack={noop}
    onKeep={noop}
    onApply={noop}
  />
);

const seat = (uid: string, name: string, joinIndex: number) => ({
  uid,
  name,
  fullName: `${name} Nguyen`,
  joinIndex,
  organiser: false,
  rsvp: 'in' as RsvpStatus,
  repliedAt: null,
});

/** A full free crew, so the sheet shows the designed case. */
const seated = [...LAB_PEOPLE, seat('u-vy', 'Vy', 4), seat('u-bao', 'Bảo', 5)];

const waiting = {
  uid: 'u-sam',
  name: 'Sam',
  fullName: 'Sam Nguyen',
  joinIndex: 6,
  organiser: false,
  rsvp: 'waitlisted' as RsvpStatus,
  repliedAt: null,
};

export const DROPOUT_SCENES: Readonly<Record<string, () => ReactNode>> = {
  'trailer-slide': () => (
    <View style={{ flex: 1 }} testID="lab-trailer-slide">
      <TrailerSlide
        guide="chava"
        eyebrow="Day 1 · 07:30"
        headline="Bà Nà before the crowds."
        body="First cable car up, and the Golden Bridge to ourselves."
      />
    </View>
  ),
  dropout: () => dropout(false),
  'dropout-applied': () => dropout(true),
  crowd: () => (
    <Dismissable>
      {(close) => (
        <CrowdSheet
          destination="Đà Nẵng"
          cap={SEAT_CAP_FREE}
          seated={seated}
          waiting={[waiting]}
          onBoost={null}
          onClose={close}
        />
      )}
    </Dismissable>
  ),
};
