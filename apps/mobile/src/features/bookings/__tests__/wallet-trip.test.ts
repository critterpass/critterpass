/** The wallet's trip: the one it was opened for when the crew has it, else its own pick. */
import { describe, expect, it } from '@jest/globals';

import type { TripRow } from '../data/queries';
import { pickTrip } from '../data/use-wallet-context';

const trip = (id: string, status: string, start: string): TripRow => ({
  id,
  status,
  start_date: start,
  end_date: null,
  tz: null,
  destination_name: null,
});

const TRIPS = [
  trip('bali', 'in_trip', '2026-10-12'),
  trip('kyoto', 'planning', '2027-03-01'),
  trip('hanoi', 'post_trip', '2026-05-01'),
];

describe('the trip the wallet shows', () => {
  it('is the trip under way when the wallet was opened on its own', () => {
    expect(pickTrip(TRIPS)?.id).toBe('bali');
  });

  it('is the trip whose hub opened it, even with another under way', () => {
    expect(pickTrip(TRIPS, 'kyoto')?.id).toBe('kyoto');
    expect(pickTrip(TRIPS, 'hanoi')?.id).toBe('hanoi');
  });

  it('falls back to its own pick for a trip this crew does not have', () => {
    expect(pickTrip(TRIPS, 'someone-elses')?.id).toBe('bali');
  });
});
