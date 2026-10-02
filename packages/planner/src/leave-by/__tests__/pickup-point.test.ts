import { describe, expect, it } from 'vitest';

import {
  acceptAddress,
  acceptOwnPlace,
  currentPickupPoint,
  pickupNeedsPlacing,
  pickupText,
  type OwnPlaceCandidate,
} from '../index';

const DA_NANG = { lat: 16.0544, lng: 108.2022 };

const poi = (name: string, scores: Partial<OwnPlaceCandidate> = {}): OwnPlaceCandidate => ({
  poiId: '0199a1b2-0000-7000-8000-000000000001',
  name,
  lat: 16.0605,
  lng: 108.2468,
  similarity: 0.6,
  wordSimilarity: 1,
  ...scores,
});

describe('pickupText', () => {
  it('reads the location first, then the printed meeting point or pick-up desk', () => {
    expect(pickupText({ location: ' Pickup at Muong Thanh Luxury ', details: {} })).toBe(
      'Pickup at Muong Thanh Luxury',
    );
    expect(pickupText({ location: '', details: { meeting_point: 'Hotel lobby' } })).toBe(
      'Hotel lobby',
    );
    expect(pickupText({ location: null, details: { pick_up: 'Arrivals hall, gate 3' } })).toBe(
      'Arrivals hall, gate 3',
    );
    expect(pickupText({ location: null, details: null })).toBeNull();
  });
});

describe('acceptOwnPlace', () => {
  it('takes a POI whose name stands whole in the pickup text', () => {
    expect(acceptOwnPlace([poi('Muong Thanh Luxury Da Nang')], DA_NANG)).toMatchObject({
      source: 'poi',
      label: 'Muong Thanh Luxury Da Nang',
      poiId: '0199a1b2-0000-7000-8000-000000000001',
    });
  });

  it('refuses weak matches, short generic names and places outside the destination', () => {
    expect(acceptOwnPlace([poi('Novotel Danang Premier', { wordSimilarity: 0.5 })], DA_NANG)).toBe(
      null,
    );
    expect(acceptOwnPlace([poi('Novotel Danang Premier', { similarity: 0.2 })], DA_NANG)).toBe(
      null,
    );
    expect(acceptOwnPlace([poi('Hotel')], DA_NANG)).toBeNull();
    // Hội An's own Muong Thanh is 25 km away and fine; one in Hà Nội is not.
    expect(
      acceptOwnPlace([poi('Muong Thanh Hoi An', { lat: 15.88, lng: 108.33 })], DA_NANG),
    ).not.toBe(null);
    expect(acceptOwnPlace([poi('Muong Thanh Ha Noi', { lat: 21.03, lng: 105.85 })], DA_NANG)).toBe(
      null,
    );
  });

  it('refuses two good matches that are different places', () => {
    const beach = poi('Muong Thanh Luxury', { poiId: 'a' });
    const river = poi('Muong Thanh Grand', { poiId: 'b', lat: 16.07, lng: 108.22 });
    expect(acceptOwnPlace([beach, river], DA_NANG)).toBeNull();
    const sameLobby = poi('Muong Thanh Luxury Lobby', { poiId: 'c', lat: 16.0606 });
    expect(acceptOwnPlace([beach, sameLobby], DA_NANG)).toMatchObject({
      label: 'Muong Thanh Luxury',
    });
  });
});

describe('acceptAddress', () => {
  const address = {
    lat: 16.0605,
    lng: 108.2468,
    formattedAddress: '10 Võ Nguyên Giáp, Đà Nẵng',
    featureType: 'address',
    confidence: 'exact',
  };

  it('takes an address matched exactly or nearly so, inside the destination', () => {
    expect(acceptAddress([address], DA_NANG)).toMatchObject({ source: 'mapbox' });
    expect(acceptAddress([{ ...address, confidence: 'high' }], DA_NANG)).not.toBeNull();
  });

  it('never takes a looser match, a street, a locality or a far address', () => {
    expect(acceptAddress([{ ...address, confidence: 'medium' }], DA_NANG)).toBeNull();
    expect(acceptAddress([{ ...address, featureType: 'street', confidence: null }], DA_NANG)).toBe(
      null,
    );
    expect(acceptAddress([{ ...address, featureType: 'locality' }], DA_NANG)).toBeNull();
    expect(acceptAddress([{ ...address, lat: 21.03, lng: 105.85 }], DA_NANG)).toBeNull();
  });
});

describe('the stored pickup point', () => {
  const placed = {
    from_text: 'Pickup at Muong Thanh Luxury',
    lat: 16.0605,
    lng: 108.2468,
    label: 'Muong Thanh Luxury',
    source: 'poi',
  };

  it('counts only while it was placed from the text the booking has now', () => {
    const booking = { location: 'Pickup at Muong Thanh Luxury', details: { pickup_point: placed } };
    expect(currentPickupPoint(booking)).toEqual({
      lat: 16.0605,
      lng: 108.2468,
      label: 'Muong Thanh Luxury',
    });
    expect(pickupNeedsPlacing(booking)).toBe(false);
    const moved = { ...booking, location: 'Pickup at Novotel Danang Premier' };
    expect(currentPickupPoint(moved)).toBeNull();
    expect(pickupNeedsPlacing(moved)).toBe(true);
  });

  it('remembers a text that could not be placed, so it is not looked up again', () => {
    const lobby = {
      location: 'Hotel lobby',
      details: { pickup_point: { from_text: 'Hotel lobby', unresolved: true } },
    };
    expect(currentPickupPoint(lobby)).toBeNull();
    expect(pickupNeedsPlacing(lobby)).toBe(false);
    expect(pickupNeedsPlacing({ location: null, details: {} })).toBe(false);
    expect(pickupNeedsPlacing({ location: 'Hotel lobby', details: {} })).toBe(true);
  });
});
