import { describe, expect, it } from '@jest/globals';

import { nameAnswer, nameWords, nearestFirst } from '../name-answer';

const row = (name: string, nameLocal: string | null = null) => ({ name, nameLocal });

describe('whether a name search found the place she typed', () => {
  it('finds a place whose name has a word starting with each typed word', () => {
    expect(nameAnswer('Tanah Lot', [row('Tanah Lot Temple')])).toEqual({ kind: 'found' });
    expect(nameAnswer('tana lo', [row('Pura Tanah Lot')])).toEqual({ kind: 'found' });
    expect(nameAnswer('cho da lat', [row('Dalat Market', 'Chợ Đà Lạt')])).toEqual({
      kind: 'found',
    });
  });

  it('takes a kind word alone, or with small words, as a browse', () => {
    expect(nameWords('coffee near the')).toEqual([]);
    expect(nameAnswer('coffee', [row('Seniman')])).toEqual({ kind: 'found' });
  });

  it('says a named warung was not found, with the kind’s places to follow', () => {
    const answer = nameAnswer('Zzyqx Warung Qqq', [
      row('Aaharaam Lembongan'),
      row('DFC Tanah Lot'),
    ]);
    expect(answer).toEqual({
      kind: 'notFound',
      address: false,
      below: { rows: 'kind', category: 'food' },
    });
  });

  it('keeps a kind word that is part of a real name', () => {
    expect(nameAnswer('Warung Made', [row('Made’s Warung'), row('Warung Biah Biah')])).toEqual({
      kind: 'found',
    });
  });

  it('never lets a look-alike stand in for an address', () => {
    expect(nameAnswer('12 Tran Phu', [row('Adi Tran')])).toEqual({
      kind: 'notFound',
      address: true,
      below: { rows: 'none' },
    });
    // A place really named for the street is found.
    expect(nameAnswer('12 Tran Phu', [row('Tran Phu Quan 5')])).toEqual({ kind: 'found' });
  });

  it('offers look-alikes under their own heading for a misspelt name', () => {
    expect(nameAnswer('Tanha Lot', [row('Tanah Lot Temple')])).toEqual({
      kind: 'notFound',
      address: false,
      below: { rows: 'alike' },
    });
  });

  it('says not found with nothing to follow when there are no rows', () => {
    expect(nameAnswer('Zzyqx Qqqv', [])).toEqual({
      kind: 'notFound',
      address: false,
      below: { rows: 'alike' },
    });
  });
});

describe('a name typed with where it is', () => {
  const found = { kind: 'found' };

  it('finds the place when the extra words name the trip’s destination', () => {
    expect(nameAnswer('Crazy House Da Lat', [row('Crazy House')], 'Đà Lạt')).toEqual(found);
    expect(nameAnswer('Tanah Lot Bali', [row('Tanah Lot Temple')], 'Bali')).toEqual(found);
    expect(
      nameAnswer('Dragon Bridge Da Nang', [row('Dragon Bridge', 'Cầu Rồng')], 'Đà Nẵng'),
    ).toEqual(found);
  });

  it('finds the place when the extra words are in the row’s own area or address', () => {
    const starbucks = { ...row('Starbucks'), where: 'Ubud Jl. Raya Ubud, Gianyar' };
    expect(nameAnswer('Starbucks Ubud', [starbucks], 'Bali')).toEqual(found);
    // Another branch's area is not this row's.
    expect(
      nameAnswer('Starbucks Ubud', [{ ...row('Starbucks'), where: 'Seminyak' }], 'Bali'),
    ).toEqual({
      kind: 'notFound',
      address: false,
      below: { rows: 'alike' },
    });
  });

  it('still says a misspelt name was not found, wherever she says it is', () => {
    const missed = { kind: 'notFound', address: false, below: { rows: 'alike' } };
    expect(nameAnswer('Tanah Lott', [row('Tanah Lot Temple')], 'Bali')).toEqual(missed);
    expect(nameAnswer('Tanah Lott Bali', [row('Tanah Lot Temple')], 'Bali')).toEqual(missed);
  });

  it('does not take a row for the place because it is in the right town', () => {
    const warung = { ...row('Warung Biah Biah'), where: 'Ubud' };
    expect(nameAnswer('Zzyqx Ubud', [warung], 'Bali').kind).toBe('notFound');
  });

  it('reads the destination alone as a browse', () => {
    expect(nameAnswer('Bali', [row('Seniman')], 'Bali')).toEqual(found);
  });
});

describe('the kind’s places under a name that was not found', () => {
  it('run nearest first, never by name; a row with no spot goes last', () => {
    const from = { lat: -8.5, lng: 115.26 };
    const rows = [
      { name: 'Aaharaam', lat: -8.68, lng: 115.45 },
      { name: 'No Spot', lat: null, lng: null },
      { name: 'Zest', lat: -8.51, lng: 115.26 },
    ];
    expect(nearestFirst(rows, from).map((entry) => entry.name)).toEqual([
      'Zest',
      'Aaharaam',
      'No Spot',
    ]);
    expect(nearestFirst(rows, null)).toEqual(rows);
  });
});
