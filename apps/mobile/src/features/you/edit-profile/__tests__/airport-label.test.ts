import { describe, expect, it } from '@jest/globals';

import { airportLabel, shortAirportName } from '../airport-label';

describe('home airport label', () => {
  it('keeps the airport’s own name, without its city or the generic words', () => {
    expect(shortAirportName('Singapore Changi Airport', 'Singapore')).toBe('Changi');
    expect(shortAirportName('London Heathrow Airport', 'London')).toBe('Heathrow');
    expect(shortAirportName('Tan Son Nhat International Airport', 'Ho Chi Minh City')).toBe(
      'Tan Son Nhat',
    );
  });

  it('reads as the city when the airport is named only for it', () => {
    expect(shortAirportName('Da Nang International Airport', 'Da Nang')).toBe('Da Nang');
  });

  it('writes the code first, and nothing without an airport', () => {
    expect(airportLabel('SIN')).toBe('SIN · Changi');
    expect(airportLabel(null)).toBe('');
  });
});
