import type { DriverDirectoryCard } from '@cp/domain';

import { filterDirectory, nearbyAreas, NO_FILTERS } from '../filter';

function card(id: string, over: Partial<DriverDirectoryCard>): DriverDirectoryCard {
  return {
    id,
    display_name: id,
    areas: ['Ubud'],
    languages: ['English'],
    vehicle: null,
    seats: 6,
    day_trips: true,
    photo_url: null,
    listed_at: '2026-01-01T00:00:00Z',
    crews_loved: 1,
    crews_rated: 1,
    trips: 1,
    top_tags: [],
    ...over,
  };
}

const drivers = [
  card('komang', { areas: ['Ubud', 'Sidemen'], seats: 10, languages: ['English', 'Japanese'] }),
  card('nyoman', { areas: ['ubud'], day_trips: false }),
  card('putu', { areas: ['Sidemen'], languages: ['Bahasa Indonesia'] }),
];

describe('filterDirectory', () => {
  it('matches areas without case, languages by prefix, 7+ seats and day trips', () => {
    const ids = (filters: Parameters<typeof filterDirectory>[1]) =>
      filterDirectory(drivers, filters).map((driver) => driver.id);
    expect(ids({ ...NO_FILTERS, areas: ['UBUD'] })).toEqual(['komang', 'nyoman']);
    expect(ids({ ...NO_FILTERS, language: 'jap' })).toEqual(['komang']);
    expect(ids({ ...NO_FILTERS, sevenPlus: true })).toEqual(['komang']);
    expect(ids({ ...NO_FILTERS, dayTrips: true })).toEqual(['komang', 'putu']);
    expect(ids({ ...NO_FILTERS, areas: ['Amed'] })).toEqual([]);
  });

  it('widens an empty area to the most-listed others', () => {
    expect(nearbyAreas(drivers, ['Amed'])).toEqual(['Sidemen', 'Ubud']);
  });
});
