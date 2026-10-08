import { describe, expect, it } from 'vitest';

import { APP_LINK_SAMPLES } from '../app-link-samples';
import * as builders from '../app-links';
import { appLinkSchemeUrl, parseSchemeUrl } from '../schemes';

const TRIP = '0b8f6c1e-58f1-4a53-9d0e-6a8c8f0f4a11';
const CREW = '0190f3a2-7c11-7e4b-9a55-0d2c8e6f1b01';
const ID = '0190f3a2-7c11-7e4b-9a55-0d2c8e6f1b02';

/**
 * The strings on the wire. Pushes already delivered and rows already written carry them, so a
 * change here needs the former shape added to `currentAppPath`.
 */
const WIRE: readonly (readonly [builder: string, link: string])[] = [
  ['passLink', '/pass'],
  ['inboxLink', '/inbox'],
  ['tripHubLink', `/trips/${TRIP}`],
  ['tripDayLink', `/trips/${TRIP}/day/2026-10-17`],
  ['tripDayLink', `/trips/${TRIP}/day/today`],
  ['bookingLink', `/wallet/bookings/${ID}`],
  ['boardingPassLink', `/wallet/bookings/pass/${ID}`],
  ['addBookingLink', '/wallet/bookings/add'],
  ['moneyLink', '/wallet/money'],
  ['paymentLink', `/money/payment/${ID}`],
  ['expenseLink', `/money/expense/${ID}`],
  ['settleLink', '/money/settle'],
  ['crewsLink', '/crew'],
  ['seatOfferLink', `/crew?seat_offer=${ID}`],
  ['crewChatLink', `/crew/${CREW}/chat`],
  ['crewInviteLink', `/crew/${CREW}/invite`],
  ['voteLink', `/vote/${ID}`],
  ['voteRevealLink', `/vote/${ID}/reveal`],
  ['proposalLink', `/proposal/${ID}`],
  ['proposalTrackerLink', `/proposal/${ID}/tracker`],
  ['tripPlanLink', `/trip/${TRIP}/plan`],
  ['changeReviewLink', `/trip/${TRIP}/review/${ID}`],
  ['tripIdeasLink', `/trip/${TRIP}/ideas`],
  ['tripCheckLink', `/trip/${TRIP}/check`],
  ['tripDraftLink', `/trip/${TRIP}/draft`],
  ['setupStepLink', `/trip/${TRIP}/setup/when`],
  ['setupStepLink', `/trip/${TRIP}/setup/rooms`],
  ['setupStepLink', `/trip/${TRIP}/setup/must-dos`],
  ['addMustDoLink', `/trip/${TRIP}/setup/must-dos/add`],
  ['setupAskLink', `/trip/${TRIP}/setup/ask/${ID}`],
  ['questsLink', `/quests/${TRIP}`],
  ['crewMapLink', `/map/${TRIP}`],
  ['gettingAroundLink', '/getting-around'],
  ['disruptionLink', `/disruption/${ID}`],
  ['runningLateLink', `/late/${ID}`],
  ['forecastLink', `/forecast/${TRIP}`],
  ['sosLink', `/sos/${ID}`],
  ['supplierMessagesLink', `/supplier/messages?tripId=${TRIP}`],
  ['guideThreadLink', `/guide/${ID}`],
  ['recapLink', `/recap/${TRIP}`],
  ['postcardLink', `/recap/${TRIP}/postcard?postcard_id=${ID}`],
  ['postcardAddressLink', '/album/address'],
  ['memoryLink', `/memory/${ID}?trip=${TRIP}`],
  ['legendariesLink', '/critters/legendaries'],
  ['settingsLink', '/you/settings'],
  ['membershipLink', '/you/plan'],
  [
    'mailboxConnectedLink',
    '/wallet/mailbox/connected?provider=gmail&status=authorized&state=st_4f9a&code=4%2F0AbC-dEf_123',
  ],
  ['mailboxConnectedLink', '/wallet/mailbox/connected?provider=outlook&status=denied'],
  [
    'calendarConnectedLink',
    '/setup/calendar/connected?provider=google&status=authorized&state=st_4f9a&code=4%2F0AbC-dEf_123',
  ],
  ['calendarConnectedLink', '/setup/calendar/connected?provider=microsoft&status=failed'],
];

describe('in-app link builders', () => {
  it('write each screen as the path on the wire', () => {
    expect(APP_LINK_SAMPLES.map(({ builder, link }) => [builder, link])).toEqual(WIRE);
  });

  it('have a sample for every builder', () => {
    const sampled = new Set(APP_LINK_SAMPLES.map((sample) => sample.builder));
    expect(Object.keys(builders).filter((name) => !sampled.has(name))).toEqual([]);
  });

  it('survive the trip through a custom-scheme URL with their query', () => {
    for (const { link } of APP_LINK_SAMPLES) {
      const target = parseSchemeUrl(appLinkSchemeUrl('critterpass', link));
      const [path, search] = link.slice(1).split('?');
      expect(target).toEqual({ kind: 'app', path, ...(search === undefined ? {} : { search }) });
    }
  });

  it('keeps an OAuth code whole on its way back to the app', () => {
    const code = '4/0AdQt8qh a+b=c&d';
    const link = builders.calendarConnectedLink('google', {
      status: 'authorized',
      state: 's t',
      code,
    });
    const target = parseSchemeUrl(appLinkSchemeUrl('critterpass-staging', link));
    const search = target?.kind === 'app' ? (target.search ?? '') : '';
    expect(new URLSearchParams(search).get('code')).toBe(code);
    expect(new URLSearchParams(search).get('state')).toBe('s t');
  });
});
