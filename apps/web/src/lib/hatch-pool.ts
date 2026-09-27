/* eslint-disable lingui/no-unlocalized-strings -- design data constants, not JSX; see src/lib/guides.ts. */
/** The "hatch an egg" preview pool — matches `hatchPool` in the coming-soon design script. */
export interface HatchLocal {
  readonly no: number;
  readonly id: string;
  readonly num: string;
  readonly name: string;
  readonly city: string;
  readonly place: string;
  readonly species: string;
}

const RAW_POOL: readonly [number, string, string, string, string][] = [
  [5, 'CHÉP', 'HỘI AN', 'Hội An', 'A lantern carp'],
  [11, 'ROUCOU', 'PARIS', 'Paris', 'A pigeon in a beret'],
  [21, 'PIZZA', 'NEW YORK', 'New York', 'A subway rat'],
  [16, 'DRAC', 'BARCELONA', 'Barcelona', 'A mosaic salamander'],
  [1, 'CỤ RÙA', 'HÀ NỘI', 'Hà Nội', 'A Hoàn Kiếm turtle'],
  [23, 'LUCKY', 'LAS VEGAS', 'Las Vegas', 'A jackrabbit'],
  [18, 'LINCE', 'SEVILLE', 'Seville', 'An Iberian lynx'],
  [6, 'NGỰA', 'ĐÀ LẠT', 'Đà Lạt', 'A flower pony'],
];

export const HATCH_POOL: readonly HatchLocal[] = RAW_POOL.map(
  ([no, name, city, place, species]) => ({
    no,
    id: `cp-${String(no).padStart(3, '0')}`,
    num: String(no).padStart(3, '0'),
    name,
    city,
    place,
    species,
  }),
);

/** The pass-peek grid on the "collect the pass" feature card (`passPeek` in the design script). */
const RAW_PASS_PEEK: readonly [number, boolean][] = [
  [1, false],
  [11, false],
  [21, false],
  [41, false],
  [81, true],
  [121, true],
];

export const PASS_PEEK: readonly {
  readonly id: string;
  readonly num: string;
  readonly locked: boolean;
}[] = RAW_PASS_PEEK.map(([no, locked]) => ({
  id: `cp-${String(no).padStart(3, '0')}`,
  num: `#${String(no).padStart(3, '0')}`,
  locked,
}));
