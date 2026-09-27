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
