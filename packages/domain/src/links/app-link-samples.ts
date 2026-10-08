/**
 * One sample call of every in-app link builder, and every former path with the link that replaced
 * it. The app resolves each against its route files, so a builder whose link opens no screen fails
 * there; a builder without sample arguments does not compile here.
 */
import * as builders from './app-links';

type Builders = typeof builders;

const TRIP = '0b8f6c1e-58f1-4a53-9d0e-6a8c8f0f4a11';
const CREW = '0190f3a2-7c11-7e4b-9a55-0d2c8e6f1b01';
const ID = '0190f3a2-7c11-7e4b-9a55-0d2c8e6f1b02';
const OTHER_ID = '0190f3a2-7c11-7e4b-9a55-0d2c8e6f1b03';
const AUTHORIZED = { status: 'authorized', state: 'st_4f9a', code: '4/0AbC-dEf_123' } as const;

/** Arguments for one call of each builder; a builder with more than one outcome has a row each. */
const SAMPLE_ARGUMENTS: {
  readonly [Name in keyof Builders]: readonly Parameters<Builders[Name]>[];
} = {
  passLink: [[]],
  inboxLink: [[]],
  tripHubLink: [[TRIP]],
  tripDayLink: [
    [TRIP, '2026-10-17'],
    [TRIP, 'today'],
  ],
  bookingLink: [[ID]],
  boardingPassLink: [[ID]],
  addBookingLink: [[]],
  moneyLink: [[]],
  paymentLink: [[ID]],
  expenseLink: [[ID]],
  settleLink: [[]],
  crewsLink: [[]],
  seatOfferLink: [[ID]],
  crewChatLink: [[CREW]],
  crewInviteLink: [[CREW]],
  voteLink: [[ID]],
  voteRevealLink: [[ID]],
  proposalLink: [[ID]],
  proposalTrackerLink: [[ID]],
  tripPlanLink: [[TRIP]],
  changeReviewLink: [[TRIP, ID]],
  tripIdeasLink: [[TRIP]],
  tripCheckLink: [[TRIP]],
  tripDraftLink: [[TRIP]],
  setupStepLink: [
    [TRIP, 'when'],
    [TRIP, 'rooms'],
    [TRIP, 'must-dos'],
  ],
  addMustDoLink: [[TRIP]],
  setupAskLink: [[TRIP, ID]],
  questsLink: [[TRIP]],
  crewMapLink: [[TRIP]],
  gettingAroundLink: [[]],
  disruptionLink: [[ID]],
  runningLateLink: [[ID]],
  forecastLink: [[TRIP]],
  sosLink: [[ID]],
  supplierMessagesLink: [[TRIP]],
  guideThreadLink: [[ID]],
  recapLink: [[TRIP]],
  postcardLink: [[TRIP, ID]],
  postcardAddressLink: [[]],
  memoryLink: [[ID, TRIP]],
  legendariesLink: [[]],
  settingsLink: [[]],
  membershipLink: [[]],
  mailboxConnectedLink: [
    ['gmail', AUTHORIZED],
    ['outlook', { status: 'denied' }],
  ],
  calendarConnectedLink: [
    ['google', AUTHORIZED],
    ['microsoft', { status: 'failed' }],
  ],
};

export interface AppLinkSample {
  /** The builder's name in `app-links.ts`. */
  readonly builder: string;
  readonly link: string;
}

/** The link each builder returns for its sample arguments. */
export const APP_LINK_SAMPLES: readonly AppLinkSample[] = Object.entries(SAMPLE_ARGUMENTS).flatMap(
  ([builder, calls]) => {
    const build = builders[builder as keyof Builders] as (...args: readonly unknown[]) => string;
    return calls.map((args) => ({ builder, link: build(...args) }));
  },
);

export interface FormerAppLinkSample {
  /** A path pushes and rows sent earlier carry. */
  readonly former: string;
  /** The link of the same screen today. */
  readonly current: string;
}

/** Every former path `currentAppPath` reads, with the link it stands for today. */
export const FORMER_APP_LINK_SAMPLES: readonly FormerAppLinkSample[] = [
  { former: `/hub/${TRIP}`, current: builders.tripHubLink(TRIP) },
  { former: `/hub/${TRIP}/day/2026-10-17`, current: builders.tripDayLink(TRIP, '2026-10-17') },
  { former: `/wallet/money/payment/${ID}`, current: builders.paymentLink(ID) },
  { former: `/wallet/money/expense/${ID}`, current: builders.expenseLink(ID) },
  { former: '/wallet/money/settle', current: builders.settleLink() },
  { former: `/help/${TRIP}/session/${OTHER_ID}`, current: builders.crewMapLink(TRIP) },
  { former: '/money', current: builders.moneyLink() },
  { former: `/polls/${ID}`, current: builders.voteLink(ID) },
  { former: '/guide', current: builders.guideThreadLink('new') },
];
