/** Proposal lab scenes for a trailer slide (3f-2), a dropout's change list (3f-7) and the crowd sheet (4f-1). */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab. */
import { SEAT_CAP_FREE } from '@cp/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { CrowdSheet } from '../crowd/crowd-sheet';
import type { RsvpStatus } from '../data/trip';
import { DropoutView } from '../dropout/dropout-view';
import { changeRows, type DropoutOp } from '../dropout/model';
import { dropoutReplyLine, dropoutShare, stopWhen } from '../labels';
import { TrailerSlide } from '../trailer/trailer-slide';
import { LAB_PEOPLE } from './lab-fixtures';
import { Dismissable } from './dismissable';

const noop = () => undefined;

const NAMES: Readonly<Record<string, string>> = { 'u-minh': 'Minh', 'u-an': 'An' };
const LABELS: Readonly<Record<string, string>> = {
  stay: 'Hội An homestay',
  tickets: 'Bà Nà Hills tickets',
};
/** The re-split as the worker stores it; the wording comes from the dropout model. */
const OPS: readonly DropoutOp[] = [
  { op: 'release_room_bed', room_key: '2', occupants_before: ['u-minh', 'u-an'] },
  { op: 'resplit_component', component_id: 'stay', ways_before: 4, ways_after: 3 },
  { op: 'withdraw_reminder_entry', component_id: 'tickets', uid: 'u-an' },
];

const dropout = (locale: string, resolved: boolean) => (
  <DropoutView
    name="An"
    joinIndex={3}
    guide="chava"
    guideName="Chà Vá"
    replyLine={dropoutReplyLine(locale, 'An', '2026-10-01T10:05:00.000Z')}
    rows={changeRows(
      OPS,
      (uid) => NAMES[uid] ?? '',
      (id) => LABELS[id] ?? id,
    )}
    share={dropoutShare(locale, { before: 4_200_000, after: 4_550_000, delta: 350_000 }, 'VND')}
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

export const DROPOUT_SCENES: Readonly<Record<string, (locale: string) => ReactNode>> = {
  'trailer-slide': (locale) => (
    <View style={{ flex: 1 }} testID="lab-trailer-slide">
      <TrailerSlide
        guide="chava"
        eyebrow={stopWhen(locale, {
          dayNo: 1,
          startsAt: '2026-10-02T00:30:00.000Z',
          tz: 'Asia/Ho_Chi_Minh',
        })}
        headline="Bà Nà before the crowds."
        body="First cable car up, and the Golden Bridge to ourselves."
      />
    </View>
  ),
  dropout: (locale) => dropout(locale, false),
  'dropout-applied': (locale) => dropout(locale, true),
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
