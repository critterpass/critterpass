import { describe, expect, it } from 'vitest';

import { MAX_TRIP_STOPS } from '../../src/planning/areas';
import { MAX_TRIP_STAYS, setStayChoicePayloadSchema } from '../../src/setup/rooms';

const choice = (stays: number) => ({
  trip_id: '0199a1b2-0000-7000-8000-000000000001',
  stay_option_id: 'apartment',
  stays: Array.from({ length: stays }, () => ({ stay_type: 'apartment', nights: 1 })),
});

describe('set_stay_choice stays', () => {
  it('takes a stay for every stop of the longest route, and a mix within each', () => {
    expect(setStayChoicePayloadSchema.safeParse(choice(MAX_TRIP_STOPS)).success).toBe(true);
    expect(setStayChoicePayloadSchema.safeParse(choice(MAX_TRIP_STAYS)).success).toBe(true);
    expect(setStayChoicePayloadSchema.safeParse(choice(MAX_TRIP_STAYS + 1)).success).toBe(false);
  });
});
