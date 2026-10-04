/**
 * What the curator's data and the other records of a place settle before the notes are written:
 * accents copied from another record, day trips within reach, rulings on open duplicate pairs and
 * the must-see a merge leaves standing.
 */
import { describe, expect, it } from 'vitest';

import { dayTripReach, kmOutside } from '../src/kinds/places/day-trips';
import { duplicatesOf } from '../src/kinds/places/merges';
import { namedFood } from '../src/kinds/places/note-checks';
import { mustSeeRefs, type PoiSource } from '../src/kinds/places/pois';
import { accented, type Spelling } from '../src/kinds/places/spellings';

const record = (name: string, address: string | null = null, nameLocal: string | null = null) =>
  ({ name, nameLocal, address }) satisfies Spelling;

describe('accents from another record', () => {
  it("respells a name from a record with the same words, in the name's own order", () => {
    const palace = accented(
      record('Dinh Bao Dai III', 'Trieu Viet Vuong'),
      [record('Bao Dai Summer Palace')],
      [record('Dinh III Bảo Đại'), record('Dinh Bảo Đại Đà Lạt', '1 Đường Triệu Việt Vương')],
    );
    expect(palace).toEqual({
      name: 'Dinh Bảo Đại III',
      nameLocal: null,
      address: 'Triệu Việt Vương',
    });
  });

  it('takes the run of a longer name, and keeps a house number that is its own', () => {
    expect(
      accented(
        record('Nem Nuong Tan Long', '13 Nha Chung'),
        [record('Chả Ram Bắp Nem Nướng Tân Long')],
        [record('Bánh Căn Nhà Chung', '1 Nhà Chung, Phường 3')],
      ),
    ).toEqual({ name: 'Nem Nướng Tân Long', nameLocal: null, address: '13 Nhà Chung' });
  });

  it('gives an English name the Vietnamese one of a merged record, not its park or its town', () => {
    expect(
      accented(
        record('Sculpture Tunnel'),
        [record('Clay Tunnel Dalat', null, 'Đường hầm điêu khắc')],
        [],
      ).nameLocal,
    ).toBe('Đường hầm điêu khắc');
    expect(
      accented(record('Xuan Huong Lake'), [record('Công Viên Xuân Hương')], []).nameLocal,
    ).toBe(null);
    expect(accented(record('An Cafe'), [record('An Cafe thành phố Đà Lạt')], [])).toEqual(
      record('An Cafe'),
    );
  });

  it('respells the street of an address written the English way, never half of it', () => {
    const near = [record('Nhà sách', '2 Trần Phú'), record('Bánh mì', '120 Phan Đình Phùng')];
    expect(accented(record('Le Cafe', '7 Tran Phu Street, Dalat'), [], near).address).toBe(
      '7 Trần Phú Street, Dalat',
    );
    expect(accented(record('Alley', '124/1 Pham Dinh Phung'), [], near).address).toBe(
      '124/1 Pham Dinh Phung',
    );
  });

  it('leaves a name alone when no record carries its accents', () => {
    expect(accented(record('Lam Dong Museum'), [], [record('Bánh Mì Hùng Vương')])).toEqual(
      record('Lam Dong Museum'),
    );
  });
});

describe('a name that says the place serves food', () => {
  it('reads dishes and eateries, not a station or a hill', () => {
    for (const name of [
      'Phở 126 Đà Lạt',
      'Quán bánh canh Phan Rang',
      'Gạo Coffee',
      'Sữa Tùng Đà Lạt',
    ]) {
      expect(namedFood(name), name).toBe(true);
    }
    for (const name of [
      'Ga Đà Lạt',
      'Ga Trại Mát',
      'Đồi Cỏ Hồng',
      'Làng Nấm Đà Lạt',
      'Book & Vinyl Home',
    ]) {
      expect(namedFood(name), name).toBe(false);
    }
  });
});

describe('day trips within reach', () => {
  it('keeps to the routing box as built and the map pack, and says how far out a sight lies', () => {
    const reach = dayTripReach('vn-da-lat');
    expect(reach).toEqual({ south: 11.65, west: 108.25, north: 12.12, east: 108.62 });
    if (reach === null) return;
    // The Pongour falls and Langbiang are in; the Ngoạn Mục pass lies east of the pack.
    expect(kmOutside(reach, { lat: 11.6875, lng: 108.265 })).toBe(0);
    expect(kmOutside(reach, { lat: 12.0472, lng: 108.44 })).toBe(0);
    expect(kmOutside(reach, { lat: 11.834, lng: 108.645 })).toBe(3);
    expect(dayTripReach('nowhere')).toBeNull();
  });
});

describe('duplicate pairs settled by hand', () => {
  const side = (ref: string) => ({ ref, name: ref, nameLocal: null, category: 'nature' });
  const pairs = [
    { a: side('overture:lake'), b: side('overture:lake-2'), distanceM: 900 },
    { a: side('overture:stall'), b: side('overture:stall-2'), distanceM: 300 },
  ];
  const ruling = (refs: [string, string], same: boolean) => ({ refs, names: refs, same, why: '' });

  it('merges the second into the first, or keeps both, whatever the decision left', () => {
    const open = duplicatesOf([], pairs, new Map());
    expect([...open.values()].map((d) => d.verdict)).toEqual(['review', 'review']);
    const settled = duplicatesOf([], pairs, new Map(), [
      ruling(['overture:lake', 'overture:lake-2'], true),
      ruling(['overture:stall', 'overture:stall-2'], false),
    ]);
    expect([...settled]).toEqual([['overture:lake-2', { of: 'overture:lake', verdict: 'merge' }]]);
  });
});

describe('the must-see flag', () => {
  const source = (ref: string, extra: Partial<PoiSource>): PoiSource => ({
    ref,
    destination: 'vn-da-lat',
    code: 'vn',
    name: ref,
    nameLocal: null,
    category: 'nature',
    lat: 11.94,
    lng: 108.44,
    address: null,
    tz: 'Asia/Ho_Chi_Minh',
    hours: null,
    duplicate: null,
    ...extra,
  });

  it('follows a pinned record into the record it merges into', () => {
    const refs = mustSeeRefs([
      source('overture:pinned', {
        mustSee: true,
        duplicate: { of: 'overture:kept', verdict: 'merge' },
      }),
      source('overture:kept', {}),
      source('overture:maybe', {
        mustSee: true,
        duplicate: { of: 'overture:other', verdict: 'review' },
      }),
      source('overture:other', {}),
    ]);
    expect([...refs].sort()).toEqual(['overture:kept', 'overture:maybe', 'overture:pinned']);
  });
});
