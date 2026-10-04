/**
 * What the place page works out for itself: the area from the address, which kinds get the tickets
 * card, the row of a place only the server holds, and whose saves keep a place in Ideas.
 */
import { describe, expect, it, jest } from '@jest/globals';

import { areaFromAddress, othersBacking, sellsTickets } from '../place-facts';
import { fetchedFrom, remotePoiRow } from '../remote-place';

jest.mock('@/data/travel-data/client', () => ({ useTravelDataReader: () => null }));
jest.mock('../../data/live-rows', () => ({ useLiveRows: () => ({ rows: [], loaded: false }) }));

describe('areaFromAddress', () => {
  it('takes the first named part that is not a street, a number or the destination', () => {
    expect(areaFromAddress('Jl. Hanoman No.10, Ubud, Gianyar Regency, Bali 80571', 'Bali')).toBe(
      'Ubud',
    );
    expect(areaFromAddress('3 Huỳnh Thúc Kháng, Phường 4, Đà Lạt', 'Đà Lạt')).toBeNull();
    expect(areaFromAddress('Bali', 'Bali')).toBeNull();
    expect(areaFromAddress(null, 'Bali')).toBeNull();
  });
});

describe('sellsTickets', () => {
  it('offers tickets for sights and never for a bar, a meal, a shop or a stay', () => {
    expect(['temple_shrine', 'museum', 'nature', 'beach', 'other'].map(sellsTickets)).toEqual([
      true,
      true,
      true,
      true,
      true,
    ]);
    expect(['nightlife', 'food', 'market', 'shopping', 'stay'].map(sellsTickets)).toEqual([
      false,
      false,
      false,
      false,
      false,
    ]);
  });
});

describe('a place read from the api', () => {
  const destination = {
    id: 'd1',
    tz: 'Asia/Makassar',
    name: 'Bali',
    slug: 'bali',
    guide_slug: 'tokek',
  };

  it('becomes the page row, with the destination it was opened from', () => {
    const row = remotePoiRow(
      {
        id: 'p1',
        name: '40 Thieves',
        nameLocal: null,
        category: 'nightlife',
        lat: -8.6,
        lng: 115.1,
        address: 'Jl. Petitenget, Seminyak, Bali',
        priceLevel: 3,
        hours: { mon: [['18:00', '02:00']] },
        editorial: {},
      },
      destination,
    );
    expect(row).toMatchObject({
      id: 'p1',
      destination_id: 'd1',
      category: 'nightlife',
      address: 'Jl. Petitenget, Seminyak, Bali',
      destination_tz: 'Asia/Makassar',
      guide_slug: 'tokek',
    });
    expect(JSON.parse(row?.hours ?? 'null')).toEqual({ mon: [['18:00', '02:00']] });
  });

  it('is not a row without an id and a name', () => {
    expect(remotePoiRow({ error: { code: 'NOT_FOUND' } }, destination)).toBeNull();
    expect(remotePoiRow(null, destination)).toBeNull();
  });

  it('reads a 404 as gone and any other failure as a failed read with signal', () => {
    expect(fetchedFrom(404, null)).toEqual({ kind: 'missing' });
    expect(fetchedFrom(500, null)).toEqual({ kind: 'failed', offline: false });
    expect(fetchedFrom(200, { id: 'p1' })).toEqual({ kind: 'ok', body: { id: 'p1' } });
  });
});

describe('othersBacking', () => {
  const names: Record<string, string> = { u2: 'Minh', u3: 'Rin' };
  const first = (uid: string) => names[uid] ?? null;

  it('counts the crewmates whose save keeps the place in Ideas', () => {
    expect(othersBacking(['u1'], 'u1', first)).toEqual({ count: 0, first: null });
    expect(othersBacking(['u1', 'u2'], 'u1', first)).toEqual({ count: 1, first: 'Minh' });
    expect(othersBacking(['u1', 'u9', 'u3'], 'u1', first)).toEqual({ count: 2, first: 'Rin' });
  });
});
