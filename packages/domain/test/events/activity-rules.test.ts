import { describe, expect, it } from 'vitest';

import { DOMAIN_EVENT_TYPES, type DomainEventType } from '../../src/events/catalogue';
import { projectActivity } from '../../src/events/activity-rules';
import { SETUP_EVENT_TYPES } from '../../src/setup/events';
import { MONEY_EVENT_TYPES } from '../../src/money/events';
import { DRAFT_EVENT_TYPES } from '../../src/itinerary/events';
import { BOOKING_EVENT_TYPES } from '../../src/bookings/events';
import { BILLING_EVENT_TYPES } from '../../src/billing/events';
import { SUPPLIER_EVENT_TYPES } from '../../src/suppliers/events';
import { PLAN_EVENT_TYPES } from '../../src/plan/events';
import { GUIDE_EVENT_TYPES } from '../../src/guide/events';
import { TRIP_DAY_EVENT_TYPES } from '../../src/trip-day/events';
import { EXPLORE_EVENT_TYPES } from '../../src/explore/events';
import { PROPOSAL_EVENT_TYPES } from '../../src/proposal/events';
import { CRITTER_EVENT_TYPES } from '../../src/critters/events';
import { QUEST_EVENT_TYPES } from '../../src/quests/events';
import { LA_EVENT_TYPES } from '../../src/surfaces/la-events';
import { YOU_EVENT_TYPES } from '../../src/you/events';
import { SAFETY_EVENT_TYPES } from '../../src/safety/events';

/**
 * Events with no business belonging in a crew/trip activity ticker (activity-rules.ts's own
 * docstring: "private events stay out of the crew-visible ticker"). `auth.merged` describes an
 * identity operation on one account, not something any crew member should see in a shared feed.
 * `invite.opened` and `attribution.claimed` are funnel signals about a link or a device, not crew
 * activity. `fare.dropped`, `forecast.changed` and `hazard.changed` are system signals that the tip
 * strip and the watch job turn into their own surfaces; nobody in the crew did them.
 * `moderation.decided` is an ops verdict consumed by the reported content's owner; support
 * entitlement grants concern one account. A device's permission mirror and a POI visit are private
 * to their owner (visits are owner-only by design). Pass and profile changes reach the crew as
 * synced rows and a `member.updated` hint, not as ticker lines. Crew lifecycle and invite events
 * describe a crew, a link or one person's answer, not a trip moment; seat offers and referral
 * progress are private to the person they concern (a taken seat shows as `seat_offer.accepted`).
 * Chat events are the chat timeline itself; echoing them in the ticker would repeat every message.
 * Live map events are realtime moments (shares, meet-ups, pings) with their own pushes.
 */
const PRIVATE_EVENT_TYPES: ReadonlySet<DomainEventType> = new Set([
  'auth.merged',
  'invite.opened',
  'attribution.claimed',
  'fare.dropped',
  'forecast.changed',
  'hazard.changed',
  'moderation.decided',
  'entitlement.granted',
  'entitlement.revoked',
  'device.permissions_changed',
  'visit.recorded',
  'pass.issued',
  'profile.updated',
  'profile.taste_changed',
  'profile.avatar_changed',
  'crew.created',
  'crew.updated',
  'crew.code_rotated',
  'user.active_crew_changed',
  'invite.created',
  'invite.claimed',
  'invite.deferred',
  'invite.declined',
  'invite.revoked',
  'invite.nudged',
  'trip.seat_opened',
  'referral.progressed',
  'chat.message_sent',
  'chat.message_edited',
  'chat.message_deleted',
  'chat.reaction_changed',
  'chat.guide_mentioned',
  // Inbox, nudge and tip events are personal or already on Home; countdown inputs are announced by
  // the features that change dates and bookings.
  'inbox.item_resolved',
  'inbox.read',
  'nudge.sent',
  'nudge.received',
  'tip.created',
  'tip.dismissed',
  'trip.dates_changed',
  'trip.destination_set',
  'booking.flight_added',
  'booking.flight_changed',
  'booking.flight_removed',
  'user.tz_changed',
  // Crew live map moments are realtime and pushed; a ticker line would outlive the moment.
  'location_share.changed',
  'meetup.created',
  'meetup.moved',
  'meetup.crew_close',
  'crew.pinged',
  // Single ballots, stage moves and reveals are the vote's own UI; a pitch reaches the ticker once
  // it is on the board, and saved places are personal.
  'poll.candidate_removed',
  'poll.stage_changed',
  'poll.cancelled',
  'poll.reveal_seen',
  'poll.lead_changed',
  'poll.closing_soon',
  'poll.pick_needed',
  'ballot.cast',
  'ballot.changed',
  'ballot.retracted',
  'pitch.created',
  'pitch.queued',
  'place.saved',
  'place.unsaved',
  // Setup progress shows on the wizard itself (live on its realtime channel); availability, asks,
  // budget counts and calendar nudges are private to the member they concern.
  ...SETUP_EVENT_TYPES,
  // Money has its own feed (Money's LATEST row, the chat card, the settle list); payments and
  // nudges are between two members.
  ...MONEY_EVENT_TYPES,
  // Drafts are private to the trip's organisers until the proposal goes out.
  ...DRAFT_EVENT_TYPES,
  // Bookings have their own surfaces (the wallet stack, the flight card, the import banner).
  ...BOOKING_EVENT_TYPES,
  // Billing speaks through its own surfaces (the boost card, the BOOSTED pill, Your plan);
  // purchases, subscriptions and paywall events concern one account.
  ...BILLING_EVENT_TYPES,
  // Supplier orders and link clicks speak through the offer card, the hold chip and the wallet.
  ...SUPPLIER_EVENT_TYPES,
  // Change review shows on its own card and poll; comments live in their threads. A direct plan
  // edit reaches the ticker as `plan.ops_applied`.
  ...PLAN_EVENT_TYPES.filter((type) => type !== 'plan.ops_applied'),
  // The guide speaks in its own threads and in crew chat, never through the ticker.
  ...GUIDE_EVENT_TYPES,
  ...TRIP_DAY_EVENT_TYPES,
  // Swiping is live on its own channel; a match reaches the crew as a plan suggestion.
  ...EXPLORE_EVENT_TYPES,
  // A proposal speaks through its story, tracker and pushes; RSVPs reach the ticker as
  // `rsvp.changed`, and opens, objections and follow-ups are never crew-visible at all.
  ...PROPOSAL_EVENT_TYPES,
  // Finds speak through the pass and the crew_collection hints; eggs and encounters are one member's.
  ...CRITTER_EVENT_TYPES,
  // Quests speak through their own screen, the hub tile and the reward reveal.
  ...QUEST_EVENT_TYPES,
  ...LA_EVENT_TYPES,
  // Settings, icons and past trips concern one account only.
  ...YOU_EVENT_TYPES,
  // Help and SOS speak through the takeover, the push and the session itself, never the ticker.
  ...SAFETY_EVENT_TYPES,
]);

function publicEventTypes(): readonly DomainEventType[] {
  return DOMAIN_EVENT_TYPES.filter((type) => !PRIVATE_EVENT_TYPES.has(type));
}

describe('projectActivity', () => {
  it('projects every public event (crew/trip visible)', () => {
    for (const type of publicEventTypes()) {
      expect(projectActivity(type)).not.toBeNull();
    }
  });

  it('never projects a private event', () => {
    for (const type of PRIVATE_EVENT_TYPES) {
      expect(projectActivity(type)).toBeNull();
    }
  });

  it('gives trip.status_changed the documented verb, object kind and i18n key', () => {
    expect(projectActivity('trip.status_changed')).toEqual({
      verb: 'moved',
      objectKind: 'trip',
      textKey: 'activity.trip_status_changed',
    });
  });

  it('every text key follows the activity.<verb-ish> convention', () => {
    for (const type of publicEventTypes()) {
      const projection = projectActivity(type);
      expect(projection?.textKey.startsWith('activity.')).toBe(true);
    }
  });
});
