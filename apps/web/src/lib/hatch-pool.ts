/* eslint-disable lingui/no-unlocalized-strings -- design data constants, not JSX; see src/lib/guides.ts. */
/** The "hatch an egg" preview pool — matches `hatchPool` in the coming-soon design script. Each
 * local's one-line introduction is copy (`hatchLocalCopy`), keyed by the `id` here. */
export interface HatchLocal {
  readonly no: number;
  readonly id: string;
  readonly num: string;
  readonly name: string;
  readonly city: string;
}

const RAW_POOL: readonly [number, string, string][] = [
  [5, 'CHÉP', 'HỘI AN'],
  [11, 'ROUCOU', 'PARIS'],
  [21, 'PIZZA', 'NEW YORK'],
  [16, 'DRAC', 'BARCELONA'],
  [1, 'CỤ RÙA', 'HÀ NỘI'],
  [23, 'LUCKY', 'LAS VEGAS'],
  [18, 'LINCE', 'SEVILLE'],
  [6, 'NGỰA', 'ĐÀ LẠT'],
];

export const HATCH_POOL: readonly HatchLocal[] = RAW_POOL.map(([no, name, city]) => ({
  no,
  id: `cp-${String(no).padStart(3, '0')}`,
  num: String(no).padStart(3, '0'),
  name,
  city,
}));

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
