import { describe, expect, it } from 'vitest';

import {
  buildPlacePicksRequest,
  checkPlacePicksReply,
  createGateway,
  nameWellKnownPlaces,
  PLACE_PICKS_MAX,
  templateSummary,
} from '../src';
import { fixtureTransport } from './fixture-transport';

describe('checkPlacePicksReply', () => {
  it('keeps well-formed entries once each and reads an unknown kind as other', () => {
    const places = checkPlacePicksReply({
      places: [
        { name: 'Xuan Huong Lake', local_name: 'Hồ Xuân Hương', kind: 'nature', area: 'Ward 1' },
        { name: 'xuan  huong lake', local_name: null, kind: 'nature', area: null },
        { name: 'Crazy House', local_name: 'Crazy House', kind: 'villa', area: '' },
        { name: 'x', local_name: null, kind: 'food', area: null },
        { local_name: 'Chợ Đà Lạt', kind: 'market', area: null },
      ],
    });
    expect(places).toEqual([
      { name: 'Xuan Huong Lake', localName: 'Hồ Xuân Hương', kind: 'nature', area: 'Ward 1' },
      { name: 'Crazy House', localName: null, kind: 'other', area: null },
    ]);
  });

  it('caps the list and reads a bad shape as no names', () => {
    const many = Array.from({ length: PLACE_PICKS_MAX + 5 }, (_, i) => ({
      name: `Place number ${i}`,
      local_name: null,
      kind: 'food',
      area: null,
    }));
    expect(checkPlacePicksReply({ places: many })).toHaveLength(PLACE_PICKS_MAX);
    expect(checkPlacePicksReply({ places: 'none' })).toEqual([]);
    expect(checkPlacePicksReply(undefined)).toEqual([]);
  });
});

describe('nameWellKnownPlaces', () => {
  it('sends only the destination and reads the reply through the gateway', async () => {
    const transport = fixtureTransport(['place-picks-da-lat']);
    const gateway = createGateway({ apiKey: 'fixture-key', fetch: transport.fetch });
    const places = await nameWellKnownPlaces(gateway, {
      destination: 'Đà Lạt',
      country: 'Vietnam',
    });
    expect(places).toHaveLength(60);
    expect(places[0]).toEqual({
      name: 'Crazy House',
      localName: 'Biệt thự Hằng Nga',
      kind: 'other',
      area: 'Phường 3',
    });
    expect(places.find((place) => place.name === 'An Cafe')?.localName).toBeNull();
    const sent = JSON.stringify(transport.requests[0]);
    expect(sent).toContain('The destination is Đà Lạt, Vietnam.');
    expect(buildPlacePicksRequest({ destination: 'Huế', country: null }).messages).toEqual([
      { role: 'user', content: 'The destination is Huế. List its places.' },
    ]);
  });

  it('throws when the call fails, so the caller decides what to do without names', async () => {
    const gateway = createGateway({
      apiKey: 'fixture-key',
      maxAttempts: 1,
      fetch: fixtureTransport(['anthropic/overloaded-529']).fetch,
    });
    await expect(
      nameWellKnownPlaces(gateway, { destination: 'Đà Lạt', country: 'Vietnam' }),
    ).rejects.toThrow();
  });
});

describe('a draft summary for a destination we know few places in', () => {
  it('says the draft is thin instead of the usual line', () => {
    const line = templateSummary({
      guide: 'guest',
      destination: 'Đà Lạt',
      themes: [],
      allMustDos: true,
      thin: true,
    });
    expect(line).toContain('only know a few places in Đà Lạt');
    expect(
      templateSummary({ guide: 'guest', destination: 'Kyoto', themes: [], allMustDos: true }),
    ).toBe('Every must-do made it into your Kyoto draft.');
  });
});
