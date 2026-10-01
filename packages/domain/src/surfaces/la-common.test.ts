import { describe, expect, it } from 'vitest';
import type { z } from 'zod';

import { LA_KIND_SPECS } from '../live-activities';
import { LA_KINDS, LA_REF_KEYS, laRefId } from './la-common';

describe('Live Activity object ids', () => {
  it('every kind names its object with a uuid field of its attributes', () => {
    for (const kind of LA_KINDS) {
      const shape = (LA_KIND_SPECS[kind].attributes as z.ZodObject).shape;
      expect(Object.keys(shape), kind).toContain(LA_REF_KEYS[kind]);
    }
  });

  it('reads the object id, and nothing from attributes without one', () => {
    const id = '0199a3c0-0000-7000-8000-000000000001';
    expect(laRefId('flight', { segment_id: id, booking_id: 'b' })).toBe(id);
    expect(laRefId('vote', { question: 'Where?' })).toBeNull();
    expect(laRefId('leave_by', { leave_by_id: '' })).toBeNull();
  });
});
