import { describe, expect, it } from '@jest/globals';

import { savedMapAreas } from '../saved-map-areas';

const asset = (kind: 'map_region' | 'attachment', key: string) => ({
  kind,
  key,
  label: 'Map',
  uri: `file:///trip/${key}`,
  savedAt: '2026-11-10T00:00:00Z',
});
const day = (localDate: string, ...assets: ReturnType<typeof asset>[]) => ({ localDate, assets });

describe('savedMapAreas', () => {
  const areaOfDate = new Map([['2026-11-13', 'Machu Picchu']]);

  it('names each area whose map the saved days hold, the city first', () => {
    const days = [
      day('2026-11-13', asset('map_region', 'regions/machu-picchu-v2.pmtiles')),
      day(
        '2026-11-12',
        asset('attachment', 'ticket.pdf'),
        asset('map_region', 'regions/cusco-v7.pmtiles'),
      ),
      day('2026-11-14', asset('map_region', 'regions/cusco-v7.pmtiles')),
    ];
    expect(savedMapAreas(days, 'Cusco', areaOfDate)).toEqual(['Cusco', 'Machu Picchu']);
  });

  it('names nothing for a trip that holds its own city alone, or no map at all', () => {
    const city = [day('2026-11-12', asset('map_region', 'regions/cusco-v7.pmtiles'))];
    expect(savedMapAreas(city, 'Cusco', new Map())).toEqual([]);
    expect(
      savedMapAreas([day('2026-11-12', asset('attachment', 'ticket.pdf'))], 'Cusco', areaOfDate),
    ).toEqual([]);
  });

  it('names the day trip alone when only its day is saved', () => {
    const days = [day('2026-11-13', asset('map_region', 'regions/machu-picchu-v2.pmtiles'))];
    expect(savedMapAreas(days, 'Cusco', areaOfDate)).toEqual(['Machu Picchu']);
  });
});
