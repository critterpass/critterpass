/** Fixed people, picks and answers for the proposal lab scenes (Đà Nẵng, a crew of four). */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab. */
import { pickTag, type Pick } from '../data/picks';
import type { ProposalVersion } from '../data/proposal';
import type { Saving } from '../data/savings';
import type { CrewPerson, RsvpStatus } from '../data/trip';
import type { PrivateOption } from '../objection/options';

const person = (
  uid: string,
  name: string,
  joinIndex: number,
  rsvp: RsvpStatus,
  organiser = false,
): CrewPerson => ({
  uid,
  name,
  fullName: `${name} Nguyen`,
  joinIndex,
  organiser,
  rsvp,
  repliedAt: '2026-10-01T09:20:00.000Z',
});

export const LAB_PEOPLE: readonly CrewPerson[] = [
  person('u-khanh', 'Khanh', 0, 'in', true),
  person('u-linh', 'Linh', 1, 'in'),
  person('u-minh', 'Minh', 2, 'maybe'),
  person('u-an', 'An', 3, 'unopened'),
];

export const LAB_RECIPIENTS = LAB_PEOPLE.filter((p) => !p.organiser);

export const LAB_PICKS: readonly Pick[] = [
  {
    itemId: 'i1',
    title: 'Bà Nà Hills at opening',
    dayNo: 1,
    startsAt: null,
    tz: null,
    category: 'sight',
    reasonTag: 'your_must_do',
    reasonLabel: null,
    note: null,
    dayTheme: null,
  },
  {
    itemId: 'i2',
    title: 'Mì Quảng on Hải Phòng street',
    dayNo: 2,
    startsAt: null,
    tz: null,
    category: 'food',
    reasonTag: 'matches_taste',
    reasonLabel: 'YOU PICKED STREET FOOD',
    note: null,
    dayTheme: null,
  },
  {
    itemId: 'i3',
    title: 'A free afternoon at Mỹ Khê',
    dayNo: 3,
    startsAt: null,
    tz: null,
    category: 'beach',
    reasonTag: 'good_value',
    reasonLabel: null,
    note: null,
    dayTheme: null,
  },
];

/** The group version's cards: the plan's own stops, tagged for what they are. */
export const LAB_GROUP_PICKS: readonly Pick[] = LAB_PICKS.map((pick, index) => ({
  ...pick,
  reasonTag: index === 0 ? 'group_must_do' : 'group_day',
  reasonLabel: null,
}));

export const LAB_SAVINGS: readonly Saving[] = [
  {
    id: 'skip:ba-na',
    label: 'Bà Nà Hills',
    deltaMinor: -950_000,
    displayDeltaMinor: -950_000,
    currency: 'VND',
  },
];

export const LAB_OPTIONS: readonly PrivateOption[] = [
  {
    id: 'skip:ba-na',
    kind: 'skip_item',
    label: 'Skip Bà Nà Hills',
    deltaMinor: -950_000,
    displayDeltaMinor: -950_000,
    currency: 'VND',
  },
  {
    id: 'follow_up',
    kind: 'follow_up',
    label: 'Ask me later',
    deltaMinor: null,
    displayDeltaMinor: null,
    currency: null,
  },
];

const version = (recipientId: string, status: ProposalVersion['status']): ProposalVersion => ({
  id: `v-${recipientId}`,
  recipientId,
  status,
  shared: false,
  slides: [],
  posterTitle: null,
  postcardMessage: null,
  highlights: [],
  savingIds: [],
  shareMinor: 4_200_000,
  currency: 'VND',
  leadItemId: null,
  fallbackNote: null,
});

export const LAB_VERSIONS: readonly ProposalVersion[] = [
  version('u-linh', 'ready'),
  { ...version('u-minh', 'fallback'), fallbackNote: 'Chà Vá wrote the group version for Minh' },
  version('u-an', 'pending'),
];

export const LAB_SUGGESTIONS = [
  {
    id: 's1',
    kind: 'resend',
    copy: 'Resend to An at 21:00 their time, with Mì Quảng up front?',
  },
];

/** The card's tag as a reader with wishes on record sees it. */
export const labTag = (pick: Pick): string =>
  pickTag(pick, { uid: null, hasWishes: true, guideName: 'Chà Vá' });

/** NOT SURE YET with the cost picked and one skip taken; the answer is due after Sunday. */
export const LAB_OBJECTION = {
  guide: 'chava',
  guideName: 'Chà Vá',
  organiserName: 'Khanh',
  freeCancelLine: null,
  replyBy: null,
  reason: 'cost',
  answer: { threadId: 't1', options: LAB_OPTIONS },
  chosen: ['skip:ba-na'],
  pending: false,
  failed: false,
  later: { when: 'sunday', atLocal: '2026-10-04T19:00' },
} as const;
