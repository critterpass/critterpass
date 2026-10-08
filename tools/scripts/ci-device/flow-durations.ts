/**
 * How long each flow takes, for planning shards by time (plan-shards.ts): the median minutes of its
 * passing Android runs in the release gate's reports (the "Release gate" issue). A flow with no
 * recorded run counts as DEFAULT_FLOW_MINUTES. Update a row when a journey's length changes for
 * good; an approximate number is enough to balance shards.
 */
export const DEFAULT_FLOW_MINUTES = 5;

export const FLOW_MEDIAN_MINUTES: Readonly<Record<string, number>> = {
  'e2e/happy/bookings.yaml': 3.7,
  'e2e/happy/by-share.yaml': 3.0,
  'e2e/happy/chat.yaml': 2.9,
  'e2e/happy/critters.yaml': 2.9,
  'e2e/happy/da-nang-guide.yaml': 4.1,
  'e2e/happy/drafting.yaml': 4.5,
  'e2e/happy/fresh-chat.yaml': 4.5,
  'e2e/happy/fresh-crew-chat-walk.yaml': 9.9,
  'e2e/happy/fresh-critters.yaml': 16.6,
  'e2e/happy/fresh-dropout.yaml': 13.2,
  'e2e/happy/fresh-guide-chat-walk.yaml': 4.6,
  'e2e/happy/fresh-home-trip.yaml': 3.9,
  'e2e/happy/fresh-join-code.yaml': 3.9,
  'e2e/happy/fresh-join-code-vi.yaml': 4.1,
  'e2e/happy/fresh-join-under-way.yaml': 31.1,
  'e2e/happy/fresh-proposal.yaml': 13.3,
  'e2e/happy/fresh-setup.yaml': 4.2,
  'e2e/happy/fresh-setup-vnd.yaml': 5.0,
  'e2e/happy/fresh-solo-confirm.yaml': 5.5,
  'e2e/happy/fresh-trip-bookings.yaml': 15.4,
  'e2e/happy/fresh-trip-day.yaml': 8.5,
  'e2e/happy/fresh-trip-landing.yaml': 18.7,
  'e2e/happy/fresh-trip-money.yaml': 8.8,
  'e2e/happy/fresh-trip-under-way.yaml': 5.9,
  'e2e/happy/fresh-uncurated-draft.yaml': 6.4,
  'e2e/happy/fresh-wallet.yaml': 4.0,
  'e2e/happy/guide-chat.yaml': 3.1,
  'e2e/happy/home-inbox.yaml': 2.6,
  'e2e/happy/money.yaml': 3.3,
  'e2e/happy/onboarding.yaml': 2.1,
  'e2e/happy/setup.yaml': 3.6,
  'e2e/happy/suppliers.yaml': 2.7,
  'e2e/happy/trip-day.yaml': 3.5,
  'e2e/happy/vote.yaml': 3.7,
};

/** Recorded median minutes of a repo-root-relative flow file, or the default. */
export function flowMinutes(flow: string): number {
  return FLOW_MEDIAN_MINUTES[flow.replace(/\\/g, '/')] ?? DEFAULT_FLOW_MINUTES;
}
