/**
 * Full names across the ways open data writes them (a Vietnamese head word, "y" for "i", names
 * written joined, an elided article), and a row of the place's own full name kilometres from
 * the researcher's point: taken when it says which place it is and no row of that name stands
 * elsewhere. Names and distances are from staging rows the loader missed.
 */
import { describe, expect, it } from 'vitest';

import {
  chooseCuratedMatch,
  plainWords,
  type CuratedLead,
  type MatchCandidate,
} from '../../src/draft';

function lead(
  name: string,
  localName: string | null,
  category: string,
  subtype: string,
): CuratedLead {
  return {
    name,
    localName,
    category: category as CuratedLead['category'],
    lat: 0,
    lng: 0,
    subtype,
  };
}

/** A row `distanceM` north of the point. */
function row(name: string, distanceM: number, category: string): MatchCandidate {
  return {
    id: `${name}@${distanceM}`,
    name,
    nameLocal: null,
    category,
    lat: distanceM / 111_195,
    lng: 0,
    address: null,
    quality: 1,
    distanceM,
    similarity: 0.5,
  };
}

const pick = (place: CuratedLead, rows: MatchCandidate[], plain: ReadonlySet<string>) => {
  const verdict = chooseCuratedMatch(place, rows, plain);
  return verdict.kind === 'match' ? verdict.row.id : null;
};

describe('full names written another way', () => {
  it('reads a name with and without its Vietnamese head word, and "y" as "i"', () => {
    const socTrang = plainWords('Sóc Trăng', 'Vietnam');
    const nem = lead('Nem Nuong Bay Ganh', 'Nem nướng Bảy Gành', 'food', 'grilled pork sausage');
    expect(pick(nem, [row('Quán Nem Nướng Bảy Gành', 492, 'food')], socTrang)).toBe(
      'Quán Nem Nướng Bảy Gành@492',
    );
    const hoiAn = plainWords('Hội An', 'Vietnam');
    const miQuang = lead('Mi Quang Ong Hai', 'Mì Quảng Ông Hai', 'food', 'mi quang shop');
    expect(pick(miQuang, [row('Mỳ Quảng Ông Hai', 1_239, 'food')], hoiAn)).not.toBeNull();
  });

  it('reads a name written joined or with an elided article as the same name', () => {
    const langkawi = plainWords('Langkawi', 'Malaysia');
    const cupid = lead('Fat Cupid', null, 'food', 'garden restaurant');
    expect(pick(cupid, [row('fatCUPID', 633, 'food')], langkawi)).not.toBeNull();
    const hiroshima = plainWords('Hiroshima', 'Japan');
    const hassho = lead('Yagenbori Hassho', '薬研堀 八昌', 'food', 'okonomiyaki restaurant');
    expect(pick(hassho, [row('薬研堀八昌', 722, 'food')], hiroshima)).not.toBeNull();
    const geneva = plainWords('Geneva', 'Switzerland');
    const edelweiss = lead('Edelweiss', 'Edelweiss', 'food', 'alpine fondue restaurant');
    expect(pick(edelweiss, [row("L'Edelweiss", 390, 'food')], geneva)).not.toBeNull();
  });

  it('still turns down a different name', () => {
    const vungTau = plainWords('Vũng Tàu', 'Vietnam');
    const vy = lead('Banh Canh Ghe Anh Vy', 'Bánh Canh Ghẹ Anh Vy', 'food', 'crab noodle soup');
    expect(pick(vy, [row('Bánh Canh Ghẹ Phương Vy', 1_325, 'food')], vungTau)).toBeNull();
  });
});

describe('a full name further from the point', () => {
  const mangDen = plainWords('Măng Đen', 'Vietnam');
  const pagoda = lead('Khanh Lam Pagoda', 'Chùa Khánh Lâm', 'temple_shrine', 'Buddhist pagoda');

  it('takes the one row of the place’s full name within 10 km', () => {
    expect(pick(pagoda, [row('Chùa Khánh Lâm', 7_921, 'temple_shrine')], mangDen)).toBe(
      'Chùa Khánh Lâm@7921',
    );
    // Two rows of one place, a few metres apart, are still one place.
    const twin = [
      row('Chùa Khánh Lâm', 7_921, 'temple_shrine'),
      row('Chùa Khánh Lâm', 7_990, 'other'),
    ];
    expect(pick(pagoda, twin, mangDen)).toBe('Chùa Khánh Lâm@7921');
  });

  it('turns it down beyond 10 km, in two places, or when the name only says the kind', () => {
    expect(pick(pagoda, [row('Chùa Khánh Lâm', 10_500, 'temple_shrine')], mangDen)).toBeNull();
    const chain = [
      row('Chùa Khánh Lâm', 3_000, 'temple_shrine'),
      row('Chùa Khánh Lâm', 7_921, 'temple_shrine'),
    ];
    expect(pick(pagoda, chain, mangDen)).toBeNull();
    const haLong = plainWords('Hạ Long', 'Vietnam');
    const market = lead('Ha Long Night Market', 'Chợ đêm Hạ Long', 'market', 'night market');
    expect(pick(market, [row('Ha Long Night Market', 4_675, 'market')], haLong)).toBeNull();
    // One word apart is a near match only.
    const vy = lead('Mien Luon Ba Phan', 'Miến lươn bà Phấn', 'food', 'eel glass noodle shop');
    const ninhBinh = plainWords('Ninh Bình', 'Vietnam');
    expect(pick(vy, [row('Miến Lươn Bà Phấn 997', 2_501, 'food')], ninhBinh)).toBeNull();
  });

  it('keeps the kind rules: a business is no street or area of its name', () => {
    const singapore = plainWords('Singapore', 'Singapore');
    const quay = lead('Robertson Quay', null, 'nightlife', 'riverside dining strip');
    expect(pick(quay, [row('Robertson Quay', 3_000, 'food')], singapore)).toBeNull();
  });
});
