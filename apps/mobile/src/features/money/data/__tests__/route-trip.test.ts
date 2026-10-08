/**
 * A money screen opened for one trip (an expense card in chat, the guide's camera) shows that trip
 * and its crew, whatever Balances is showing, and shows nothing rather than another trip.
 */
import { describe, expect, it } from '@jest/globals';

import { crewForRoute, tripForRoute } from '../context';
import type { CrewRow, TripRow } from '../queries';

function trip(id: string, status: string): TripRow {
  return {
    id,
    status,
    start_date: null,
    end_date: null,
    tz: null,
    local_currency: null,
    trip_length_days: null,
    current_version_id: null,
    destination_name: null,
    my_role: null,
  };
}

function crew(id: string): CrewRow {
  return { id, name: id, settlement_currency: 'USD', role: 'member' };
}

const BALI = trip('bali', 'post_trip');
const KYOTO = trip('kyoto', 'in_trip');

describe('the trip a money screen shows', () => {
  it('follows Balances without a route trip: the picked trip, else the one under way', () => {
    expect(tripForRoute([BALI, KYOTO], null, null)?.id).toBe('kyoto');
    expect(tripForRoute([BALI, KYOTO], 'bali', null)?.id).toBe('bali');
    // A pick that is no longer there falls back to the default.
    expect(tripForRoute([BALI, KYOTO], 'gone', null)?.id).toBe('kyoto');
  });

  it('shows the route trip when Money is showing another one', () => {
    // An expense card of the earlier trip, while Balances shows the trip under way.
    expect(tripForRoute([BALI, KYOTO], null, 'bali')?.id).toBe('bali');
    expect(tripForRoute([BALI, KYOTO], 'kyoto', 'bali')?.id).toBe('bali');
  });

  it('shows no trip, never another one, when the route trip is not there', () => {
    expect(tripForRoute([BALI, KYOTO], 'kyoto', 'cancelled')).toBeNull();
  });

  it('takes the crew of the route trip when the viewer is in it, else the crew chosen on Home', () => {
    const crews = [crew('home'), crew('other')];
    expect(crewForRoute(crews, 'home', 'other')?.id).toBe('other');
    expect(crewForRoute(crews, 'home', null)?.id).toBe('home');
    expect(crewForRoute(crews, 'home', 'not-mine')?.id).toBe('home');
  });
});
