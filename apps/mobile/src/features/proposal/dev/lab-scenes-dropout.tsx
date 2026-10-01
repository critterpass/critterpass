/** Proposal lab scenes for a dropout's change list (3f-7) and the crowd sheet (4f-1). */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab. */
import type { ReactNode } from 'react';

import { CrowdSheet } from '../crowd/crowd-sheet';
import type { RsvpStatus } from '../data/trip';
import { DropoutView } from '../dropout/dropout-view';
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

const waiting = {
  uid: 'u-sam',
  name: 'Sam',
  fullName: 'Sam Nguyen',
  joinIndex: 4,
  organiser: false,
  rsvp: 'waitlisted' as RsvpStatus,
  repliedAt: null,
};

export const DROPOUT_SCENES: Readonly<Record<string, () => ReactNode>> = {
  dropout: () => dropout(false),
  'dropout-applied': () => dropout(true),
  crowd: () => (
    <Dismissable>
      {(close) => (
        <CrowdSheet
          destination="Đà Nẵng"
          cap={4}
          seated={LAB_PEOPLE}
          waiting={[waiting]}
          onBoost={null}
          onClose={close}
        />
      )}
    </Dismissable>
  ),
};
