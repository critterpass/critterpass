/**
 * How long each flow takes, for planning shards by time (plan-shards.ts): the median minutes of its
 * passing Android runs in the release gate's reports (the "Release gate" issue). A flow with no
 * recorded run counts as DEFAULT_FLOW_MINUTES. Update a row when a journey's length changes for
 * good; an approximate number is enough to balance shards.
 */
export const DEFAULT_FLOW_MINUTES = 5;

export const FLOW_MEDIAN_MINUTES: Readonly<Record<string, number>> = {
  'e2e/happy/bookings.yaml': 3.0,
  'e2e/happy/by-share.yaml': 1.3,
  'e2e/happy/chat.yaml': 1.3,
  'e2e/happy/critters.yaml': 1.9,
  'e2e/happy/da-nang-guide.yaml': 2.4,
  'e2e/happy/drafting.yaml': 3.6,
  'e2e/happy/fresh-chat.yaml': 2.6,
  'e2e/happy/fresh-crew-chat-walk.yaml': 10.8,
  'e2e/happy/fresh-critters.yaml': 10.2,
  'e2e/happy/fresh-dropout.yaml': 10.2,
  'e2e/happy/fresh-guide-chat-walk.yaml': 3.9,
  'e2e/happy/fresh-home-trip.yaml': 4.9,
  'e2e/happy/fresh-join-code.yaml': 4.3,
  'e2e/happy/fresh-join-code-vi.yaml': 2.8,
  'e2e/happy/fresh-join-under-way.yaml': 30.9,
  'e2e/happy/fresh-proposal.yaml': 11.0,
  'e2e/happy/fresh-setup.yaml': 4.0,
  'e2e/happy/fresh-setup-vnd.yaml': 3.0,
  'e2e/happy/fresh-solo-confirm.yaml': 4.7,
  'e2e/happy/fresh-trip-bookings.yaml': 19.1,
  'e2e/happy/fresh-trip-day.yaml': 9.7,
  'e2e/happy/fresh-trip-landing.yaml': 3.1,
  'e2e/happy/fresh-trip-money.yaml': 13.2,
  'e2e/happy/fresh-trip-plan.yaml': 13.4,
  'e2e/happy/fresh-trip-under-way.yaml': 15.6,
  'e2e/happy/fresh-uncurated-draft.yaml': 4.6,
  'e2e/happy/fresh-wallet.yaml': 2.4,
  'e2e/happy/guide-chat.yaml': 2.8,
  'e2e/happy/home-inbox.yaml': 0.9,
  'e2e/happy/money.yaml': 1.7,
  'e2e/happy/onboarding.yaml': 2.1,
  'e2e/happy/setup.yaml': 2.5,
  'e2e/happy/suppliers.yaml': 1.3,
  'e2e/happy/trip-day.yaml': 2.4,
  'e2e/happy/vote.yaml': 2.0,
};

/** Recorded median minutes of a repo-root-relative flow file, or the default. */
export function flowMinutes(flow: string): number {
  return FLOW_MEDIAN_MINUTES[flow.replace(/\\/g, '/')] ?? DEFAULT_FLOW_MINUTES;
}
