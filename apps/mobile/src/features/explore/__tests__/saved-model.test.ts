import { describe, expect, it } from '@jest/globals';

import {
  ALL_LISTS,
  applyQueue,
  groupByDestination,
  listSummaries,
  type SavedRow,
  type SavedSubject,
} from '../saved-model';

const kyoto: SavedSubject = {
  kind: 'place',
  name: 'Kyoto',
  category: null,
  destinationId: 'kyoto',
  destinationName: 'Kyoto',
  destinationSlug: 'kyoto',
};
const poi = (name: string): SavedSubject => ({
  kind: 'poi',
  name,
  category: 'temple_shrine',
  destinationId: 'kyoto',
  destinationName: 'Kyoto',
  destinationSlug: 'kyoto',
});
const row = (
  id: string,
  subject: SavedSubject | null,
  listName: string | null = null,
): SavedRow => ({
  id,
  refId: `ref-${id}`,
  listName,
  subject,
  pending: false,
});

describe('saved places with the offline queue applied', () => {
  const subjects = new Map([['ref-new', poi('Nishiki Market')]]);

  it('shows a place saved offline at once, as pending', () => {
    const rows = applyQueue(
      [row('a', poi('Fushimi Inari'))],
      [{ cmd: 'save_place', id: 'op-1', placeId: 'ref-new', listName: 'Food' }],
      subjects,
    );
    expect(rows).toHaveLength(2);
    expect(rows[1]).toEqual({
      id: 'op-1',
      refId: 'ref-new',
      listName: 'Food',
      subject: subjects.get('ref-new'),
      pending: true,
    });
  });

  it('hides a place unsaved offline, and shows it again when saved after that', () => {
    const synced = [row('a', poi('Fushimi Inari'))];
    expect(applyQueue(synced, [{ cmd: 'unsave_place', placeId: 'ref-a' }], subjects)).toEqual([]);
    const again = applyQueue(
      synced,
      [
        { cmd: 'unsave_place', placeId: 'ref-a' },
        { cmd: 'save_place', id: 'op-2', placeId: 'ref-a', listName: null },
      ],
      subjects,
    );
    expect(again.map((r) => r.refId)).toEqual(['ref-a']);
  });

  it('moves a place between lists, by a move or by saving it into another list', () => {
    const synced = [row('a', poi('Fushimi Inari')), row('b', poi('Gion'), 'Evenings')];
    const rows = applyQueue(
      synced,
      [
        { cmd: 'move_saved_item', itemId: 'a', listName: 'Mornings' },
        { cmd: 'save_place', id: 'op-3', placeId: 'ref-b', listName: 'Mornings' },
        { cmd: 'move_saved_item', itemId: 'b', listName: null },
      ],
      subjects,
    );
    expect(rows.map((r) => [r.id, r.listName])).toEqual([
      ['a', 'Mornings'],
      ['b', null],
    ]);
  });
});

describe('lists', () => {
  it('counts the default list first, then the user lists, then lists only items name', () => {
    const rows = [
      row('a', kyoto),
      row('b', poi('Gion'), 'Evenings'),
      row('c', poi('Pontocho'), 'Stray'),
    ];
    expect(listSummaries(rows, ['Mornings', 'Evenings'])).toEqual([
      { name: null, count: 1 },
      { name: 'Mornings', count: 0 },
      { name: 'Evenings', count: 1 },
      { name: 'Stray', count: 1 },
    ]);
  });
});

describe('grouping by destination', () => {
  const rows = [
    row('k', kyoto),
    row('b', poi('Nishiki Market')),
    row('a', poi('Fushimi Inari'), 'Mornings'),
    row('x', null),
  ];

  it('puts the saved destination with its places, in name order, and counts unknown places', () => {
    const { groups, unknown } = groupByDestination(rows, ALL_LISTS);
    expect(unknown).toBe(1);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.destination?.id).toBe('k');
    expect(groups[0]?.places.map((r) => r.subject?.name)).toEqual([
      'Fushimi Inari',
      'Nishiki Market',
    ]);
  });

  it('shows one list only', () => {
    const { groups, unknown } = groupByDestination(rows, 'Mornings');
    expect(unknown).toBe(0);
    expect(groups[0]?.destination).toBeNull();
    expect(groups[0]?.places.map((r) => r.id)).toEqual(['a']);
  });
});
