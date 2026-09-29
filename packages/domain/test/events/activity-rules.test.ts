import { describe, expect, it } from 'vitest';

import { DOMAIN_EVENT_TYPES, type DomainEventType } from '../../src/events/catalogue';
import { projectActivity } from '../../src/events/activity-rules';

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
  'ballot.cast',
  'ballot.changed',
  'ballot.retracted',
  'pitch.created',
  'pitch.queued',
  'place.saved',
  'place.unsaved',
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
