import { describe, expect, it } from '@jest/globals';

import { activeJourney, checkDue, journeyMode, type JourneyRow } from '../journey';

const ME = '0190f0a0-0000-7000-8000-00000000000a';
const RIN = '0190f0a0-0000-7000-8000-00000000000b';
const SPA = '0190f0a0-0000-7000-8000-0000000000c1';

const row = (fields: Partial<JourneyRow> = {}): JourneyRow => ({
  id: 'leave-spa',
  trip_id: 'bali-trip',
  plan_item_id: SPA,
  leave_at: '2026-10-15T05:30:00Z',
  starts_at: '2026-10-15T06:00:00Z',
  legs: JSON.stringify([{ kind: 'route', mode: 'auto' }]),
  participant_ids: JSON.stringify([ME, RIN]),
  ...fields,
});

const fix = (at: string) => ({
  lat: -8.6,
  lng: 115.25,
  acc: 10,
  at: Date.parse(at),
  stationary: false,
  mock: 0,
});

describe('journey check', () => {
  const during = new Date('2026-10-15T05:45:00Z');

  it('is due only inside the leave-by window, for a member on it', () => {
    expect(activeJourney([row()], ME, during)).toEqual({
      tripId: 'bali-trip',
      itemId: SPA,
      mode: 'drive',
    });
    expect(activeJourney([row()], ME, new Date('2026-10-15T05:29:00Z'))).toBeNull();
    expect(activeJourney([row()], ME, new Date('2026-10-15T06:00:00Z'))).toBeNull();
    expect(activeJourney([row({ participant_ids: JSON.stringify([RIN]) })], ME, during)).toBeNull();
    expect(activeJourney([row()], null, during)).toBeNull();
  });

  it('posts nothing while switched off, with no journey due or with no recent fix', () => {
    const journey = activeJourney([row()], ME, during);
    const base = {
      enabled: true,
      journey,
      fix: fix('2026-10-15T05:44:30Z'),
      engineRunning: true,
      now: during,
    };
    expect(checkDue(base)).toBe(true);
    expect(checkDue({ ...base, enabled: false })).toBe(false);
    expect(checkDue({ ...base, journey: null })).toBe(false);
    expect(checkDue({ ...base, engineRunning: false })).toBe(false);
    expect(checkDue({ ...base, fix: null })).toBe(false);
    expect(checkDue({ ...base, fix: fix('2026-10-15T05:42:00Z') })).toBe(false);
  });

  it('reads how the member travels from the first leg', () => {
    expect(journeyMode(JSON.stringify([{ kind: 'pickup', mode: null }]))).toBe('transfer');
    expect(journeyMode(JSON.stringify([{ kind: 'route', mode: 'pedestrian' }]))).toBe('walk');
    expect(journeyMode(JSON.stringify([{ kind: 'route', mode: 'motor_scooter' }]))).toBe('scooter');
    expect(journeyMode(null)).toBe('drive');
  });
});
