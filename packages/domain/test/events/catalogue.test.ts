import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { DOMAIN_EVENT_TYPES, getDomainEventPayloadSchema } from '../../src/events/catalogue';

const VALID_PAYLOADS: Record<(typeof DOMAIN_EVENT_TYPES)[number], Record<string, unknown>> = {
  'crew.member_joined': { crew_id: crypto.randomUUID(), user_id: crypto.randomUUID() },
  'crew.member_left': { crew_id: crypto.randomUUID(), user_id: crypto.randomUUID() },
  'crew.member_removed': { crew_id: crypto.randomUUID(), user_id: crypto.randomUUID() },
  'trip.created': { trip_id: crypto.randomUUID(), crew_id: crypto.randomUUID() },
  'trip.status_changed': { trip_id: crypto.randomUUID(), from: null, to: 'voting' },
  'plan.version_created': {
    trip_id: crypto.randomUUID(),
    version_id: crypto.randomUUID(),
    visibility: 'crew',
  },
  'change_set.proposed': { trip_id: crypto.randomUUID(), change_set_id: crypto.randomUUID() },
  'change_set.applied': {
    trip_id: crypto.randomUUID(),
    change_set_id: crypto.randomUUID(),
    result_version_id: crypto.randomUUID(),
  },
  'change_set.reverted': { trip_id: crypto.randomUUID(), change_set_id: crypto.randomUUID() },
  'change_set.rejected': { trip_id: crypto.randomUUID(), change_set_id: crypto.randomUUID() },
  'rsvp.changed': { trip_id: crypto.randomUUID(), user_id: crypto.randomUUID(), rsvp: 'in' },
  'auth.merged': { from_uid: crypto.randomUUID(), into_uid: crypto.randomUUID() },
  'invite.opened': { join_code_id: crypto.randomUUID(), channel: 'wa' },
  'attribution.claimed': { device_id: crypto.randomUUID(), via: 'paste', link_kind: 'invite' },
  'guide_action.undone': {
    trip_id: crypto.randomUUID(),
    action_id: crypto.randomUUID(),
    undo_action_id: crypto.randomUUID(),
    change_set_id: crypto.randomUUID(),
  },
  'fare.dropped': {
    crew_id: crypto.randomUUID(),
    destination_id: crypto.randomUUID(),
    month: '2027-04',
    origin: 'SIN',
    price_minor: 25_800,
    previous_min_minor: 31_000,
    currency: 'USD',
    delta_pct: 17,
  },
  'forecast.changed': {
    trip_id: crypto.randomUUID(),
    destination_id: crypto.randomUUID(),
    changes: [{ item_stable_id: crypto.randomUUID(), reason: 'rain', date: '2026-10-02' }],
    impact: 40,
  },
  'hazard.changed': {
    trip_id: crypto.randomUUID(),
    destination_id: crypto.randomUUID(),
    hazard_id: crypto.randomUUID(),
    kind: 'volcano',
    source: 'magma',
    subject: 'Batur',
    from_level: 1,
    to_level: 2,
    impact: 60,
  },
  'moderation.decided': {
    report_id: crypto.randomUUID(),
    target_kind: 'user',
    target_id: crypto.randomUUID(),
    verdict: 'ban_author',
  },
  'entitlement.granted': {
    user_id: crypto.randomUUID(),
    grant_id: crypto.randomUUID(),
    perk: 'pass_plus',
    until: '2026-12-31T00:00:00.000Z',
  },
  'entitlement.revoked': {
    user_id: crypto.randomUUID(),
    grant_id: crypto.randomUUID(),
    perk: 'pass_plus',
  },
  'device.permissions_changed': {
    device_id: crypto.randomUUID(),
    push: 'quiet',
    can_ring: false,
    live_activities: true,
    encounters: 'session',
  },
  'visit.recorded': {
    visit_id: crypto.randomUUID(),
    trip_id: crypto.randomUUID(),
    source: 'manual',
  },
  'pass.issued': { pass_id: crypto.randomUUID(), user_id: crypto.randomUUID() },
  'profile.updated': { user_id: crypto.randomUUID(), fields: ['home_airport'] },
  'profile.taste_changed': { user_id: crypto.randomUUID(), source: 'quiz' },
  'profile.avatar_changed': {
    user_id: crypto.randomUUID(),
    avatar_id: crypto.randomUUID(),
    kind: 'photo',
  },
  'crew.created': { crew_id: crypto.randomUUID() },
  'crew.updated': { crew_id: crypto.randomUUID() },
  'crew.code_rotated': { crew_id: crypto.randomUUID(), join_code_id: crypto.randomUUID() },
  'user.active_crew_changed': { user_id: crypto.randomUUID(), crew_id: crypto.randomUUID() },
  'invite.created': {
    invite_id: crypto.randomUUID(),
    crew_id: crypto.randomUUID(),
    trip_id: null,
    kind: 'personal',
    invitee_user_id: null,
  },
  'invite.claimed': {
    invite_id: crypto.randomUUID(),
    crew_id: crypto.randomUUID(),
    trip_id: crypto.randomUUID(),
    user_id: crypto.randomUUID(),
    outcome: 'waitlisted',
    forwarded: false,
  },
  'invite.deferred': {
    invite_id: crypto.randomUUID(),
    crew_id: crypto.randomUUID(),
    trip_id: null,
  },
  'invite.declined': {
    invite_id: crypto.randomUUID(),
    crew_id: crypto.randomUUID(),
    trip_id: null,
  },
  'invite.revoked': { invite_id: crypto.randomUUID(), crew_id: crypto.randomUUID(), trip_id: null },
  'invite.nudged': {
    invite_id: crypto.randomUUID(),
    crew_id: crypto.randomUUID(),
    trip_id: null,
    invitee_user_id: crypto.randomUUID(),
  },
  'trip.seat_opened': {
    trip_id: crypto.randomUUID(),
    offer_id: crypto.randomUUID(),
    user_id: crypto.randomUUID(),
    expires_at: '2026-10-02T09:00:00+00:00',
  },
  'seat_offer.accepted': {
    trip_id: crypto.randomUUID(),
    offer_id: crypto.randomUUID(),
    user_id: crypto.randomUUID(),
  },
  'referral.progressed': { referral_id: crypto.randomUUID(), status: 'qualified' },
  'chat.message_sent': {
    crew_id: crypto.randomUUID(),
    message_id: crypto.randomUUID(),
    seq: 7,
    type: 'text',
    sender_id: crypto.randomUUID(),
    mentions: [crypto.randomUUID()],
    mentions_guide: false,
    reply_to_sender_id: null,
  },
  'chat.message_edited': { crew_id: crypto.randomUUID(), message_id: crypto.randomUUID() },
  'chat.message_deleted': { crew_id: crypto.randomUUID(), message_id: crypto.randomUUID() },
  'chat.reaction_changed': {
    crew_id: crypto.randomUUID(),
    message_id: crypto.randomUUID(),
    user_id: crypto.randomUUID(),
    added: true,
  },
  'chat.guide_mentioned': {
    crew_id: crypto.randomUUID(),
    message_id: crypto.randomUUID(),
    trip_id: null,
    asker_id: crypto.randomUUID(),
  },
  'inbox.item_resolved': {
    item_id: crypto.randomUUID(),
    user_id: crypto.randomUUID(),
    kind: 'guide_action.executed',
    action: 'undo',
  },
  'inbox.read': { user_id: crypto.randomUUID(), count: 3 },
  'nudge.sent': {
    nudge_id: crypto.randomUUID(),
    sender_id: crypto.randomUUID(),
    target_id: crypto.randomUUID(),
    crew_id: crypto.randomUUID(),
    reason: 'vote',
    channel: 'push',
  },
  'nudge.received': {
    nudge_id: crypto.randomUUID(),
    sender_id: crypto.randomUUID(),
    target_id: crypto.randomUUID(),
    crew_id: crypto.randomUUID(),
    reason: 'rsvp',
  },
  'tip.created': { tip_id: crypto.randomUUID(), crew_id: crypto.randomUUID(), kind: 'fare_drop' },
  'tip.dismissed': {
    tip_id: crypto.randomUUID(),
    crew_id: crypto.randomUUID(),
    user_id: crypto.randomUUID(),
  },
  'trip.dates_changed': { trip_id: crypto.randomUUID() },
  'trip.destination_set': { trip_id: crypto.randomUUID(), destination_id: crypto.randomUUID() },
  'booking.flight_added': {
    trip_id: crypto.randomUUID(),
    booking_id: crypto.randomUUID(),
    user_ids: [crypto.randomUUID()],
  },
  'booking.flight_changed': {
    trip_id: crypto.randomUUID(),
    booking_id: crypto.randomUUID(),
    user_ids: [],
  },
  'booking.flight_removed': {
    trip_id: crypto.randomUUID(),
    booking_id: crypto.randomUUID(),
    user_ids: [crypto.randomUUID()],
  },
  'user.tz_changed': { user_id: crypto.randomUUID(), tz: 'Asia/Ho_Chi_Minh' },
};

describe.each(DOMAIN_EVENT_TYPES)('%s payload schema', (type) => {
  it('accepts its documented payload', () => {
    const result = getDomainEventPayloadSchema(type).safeParse(VALID_PAYLOADS[type]);
    expect(result.success).toBe(true);
  });

  it('rejects an empty payload', () => {
    const result = getDomainEventPayloadSchema(type).safeParse({});
    expect(result.success).toBe(false);
  });
});

// No catalogue payload field may map to a C3 (owner-only, unpublished) column — a structural check
// that no payload carries a field name shaped like a known C3 concept (budget, dietary, payout, etc).
const FORBIDDEN_FIELD_SUBSTRINGS = [
  'budget',
  'dietary',
  'diet',
  'payout',
  'address',
  'phone',
  'passport',
  'insurance',
  'calendar',
  'coordinate',
  'health',
  'location',
  'medical',
];

describe('domain event catalogue privacy', () => {
  it('never declares a C3-shaped field in any payload schema', () => {
    for (const type of DOMAIN_EVENT_TYPES) {
      const schema = getDomainEventPayloadSchema(type);
      expect(schema).toBeInstanceOf(z.ZodObject);
      if (!(schema instanceof z.ZodObject)) continue;
      for (const field of Object.keys(schema.shape)) {
        for (const forbidden of FORBIDDEN_FIELD_SUBSTRINGS) {
          expect(field.toLowerCase()).not.toContain(forbidden);
        }
      }
    }
  });
});
