import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { DOMAIN_EVENT_TYPES, getDomainEventPayloadSchema } from '../../src/events/catalogue';

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
