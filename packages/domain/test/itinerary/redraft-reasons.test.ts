import { describe, expect, it } from 'vitest';

import {
  REDRAFT_REASON_CHIPS,
  REDRAFT_REASON_KEYS,
  REDRAFT_REASONS,
  requestRedraftPayloadSchema,
} from '../../src/itinerary/commands';

const request = (reasons: readonly string[]) =>
  requestRedraftPayloadSchema.safeParse({
    trip_id: '0199a1c2-7b3e-7c10-9a55-3f1f6e2d4b03',
    day: 2,
    reasons,
    base_version: '0199a1c2-7b3e-7c10-9a55-3f1f6e2d4b04',
  });

describe('redraft reasons', () => {
  it('accepts a later start, a lighter day and less travel', () => {
    expect(request(['later_start', 'lighter_day', 'less_travel']).success).toBe(true);
  });

  it('still accepts every reason an earlier build sends, all at once', () => {
    expect(request([...REDRAFT_REASONS]).success).toBe(true);
    expect(request(['less_train']).success).toBe(true);
    expect(request([...REDRAFT_REASON_KEYS]).success).toBe(true);
  });

  it('refuses a reason nobody defined, and a request with no reason and no note', () => {
    expect(request(['more_trains']).success).toBe(false);
    expect(request([]).success).toBe(false);
  });

  it('offers chips the command accepts, without the one about trains', () => {
    const keys = REDRAFT_REASON_CHIPS.map((chip) => chip.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(request(keys).success).toBe(true);
    expect(keys).not.toContain('less_train');
    expect(keys).toEqual(expect.arrayContaining(['later_start', 'lighter_day', 'less_travel']));
  });
});
