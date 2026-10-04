/**
 * An uncurated destination as the open-data ingest leaves it: Đà Lạt's well-known places under
 * the names the sources give them, everyday open-data rows of each kind, and the rows a pick must
 * never be (transit, stays, health, chains, low-quality, hidden, merged, another city's).
 */
import type pg from 'pg';

interface Seed {
  readonly name: string;
  readonly category: string;
  readonly confidence?: number;
  readonly sources?: Record<string, string>;
  readonly address?: string;
  readonly brand?: string;
  readonly status?: string;
  /** Kept this close to the previous row (the default puts rows about 450 m apart). */
  readonly besidePrevious?: boolean;
}

/** The rows the recorded model answer names, in the order it names them. */
export const NAMED_IN_ORDER = [
  'Crazy House',
  'Chùa Linh Phước',
  'Thiền Viện Trúc Lâm Đà Lạt',
  'Datanla Waterfall',
  'Hồ Xuân Hương',
  'Thung Lũng Tình Yêu',
  'Hồ Tuyền Lâm',
  'Dinh III Bảo Đại',
  'Chợ Đà Lạt',
  'Chợ Đêm Đà Lạt',
  'An Cafe',
  'La Việt Coffee',
  'Phở Hiếu',
  'Nem Nướng Bà Hùng',
  'Vườn Hoa Đà Lạt',
  'Maze Bar',
] as const;

const WELL_KNOWN: readonly Seed[] = [
  { name: 'Crazy House', category: 'other' },
  { name: 'Chùa Linh Phước', category: 'temple_shrine' },
  { name: 'Thiền Viện Trúc Lâm Đà Lạt', category: 'temple_shrine' },
  { name: 'Datanla Waterfall', category: 'nature' },
  { name: 'Hồ Xuân Hương', category: 'nature' },
  { name: 'Thung Lũng Tình Yêu', category: 'nature' },
  { name: 'Hồ Tuyền Lâm', category: 'nature' },
  { name: 'Dinh III Bảo Đại', category: 'museum' },
  { name: 'Chợ Đà Lạt', category: 'market' },
  { name: 'Chợ Đêm Đà Lạt', category: 'market' },
  // Two branches: the model's area picks the one on its street; the other is the same place.
  { name: 'An Cafe', category: 'food', confidence: 0.95 },
  { name: 'An Cafe', category: 'food', confidence: 0.6, address: '63 Bis 3 Tháng 2, Phường 1' },
  { name: 'La Việt Coffee', category: 'food' },
  { name: 'Phở Hiếu', category: 'food' },
  { name: 'Nem Nướng Bà Hùng', category: 'food' },
  { name: 'Vườn Hoa Đà Lạt', category: 'nature' },
  { name: 'Maze Bar', category: 'nightlife' },
];

const numbered = (stem: string, category: string, count: number): Seed[] =>
  Array.from({ length: count }, (_, index) => ({
    name: `${stem} ${String(index + 1).padStart(2, '0')}`,
    category,
    confidence: 0.9 - index * 0.01,
  }));

/** Everyday rows the fill takes, by kind. */
export const FILL = {
  sights: ['Langbiang', 'Đồi Thông Hai Mộ', 'Bảo Tàng Sinh Học'],
  food: numbered('Bếp Mộc', 'food', 8).map((seed) => seed.name),
  cafe: numbered('Cà Phê Sương', 'food', 4).map((seed) => seed.name),
  market: ['Chợ Nông Sản Trại Mát'],
  nightlife: numbered('Quán Rượu Khuya', 'nightlife', 2).map((seed) => seed.name),
  shopping: numbered('Tiệm Len', 'shopping', 2).map((seed) => seed.name),
} as const;

const EVERYDAY: readonly Seed[] = [
  { name: 'Langbiang', category: 'nature', confidence: 0.93 },
  { name: 'Đồi Thông Hai Mộ', category: 'nature', confidence: 0.92 },
  { name: 'Bảo Tàng Sinh Học', category: 'museum', confidence: 0.91 },
  ...numbered('Bếp Mộc', 'food', 8),
  ...numbered('Cà Phê Sương', 'food', 4),
  { name: 'Chợ Nông Sản Trại Mát', category: 'market' },
  ...numbered('Quán Rượu Khuya', 'nightlife', 2),
  ...numbered('Tiệm Len', 'shopping', 2),
];

/** Rows that are never a pick. */
export const NEVER_PICKED = [
  'Đà Lạt',
  'Ga Đà Lạt',
  'Khách Sạn Sương Mai',
  'Nhà Thuốc An Khang',
  'Văn Phòng Công Chứng',
  'Highlands Coffee',
  'Shop Online Giá Rẻ',
  'Bếp Mộc Ẩn',
  'Bếp Mộc Cũ',
  'bep moc 01',
] as const;

const JUNK: readonly Seed[] = [
  { name: 'Đà Lạt', category: 'other' },
  { name: 'Ga Đà Lạt', category: 'transit' },
  { name: 'Khách Sạn Sương Mai', category: 'stay' },
  { name: 'Nhà Thuốc An Khang', category: 'health' },
  { name: 'Văn Phòng Công Chứng', category: 'other' },
  { name: 'Highlands Coffee', category: 'food', brand: 'Highlands Coffee' },
  // Overture alone with a low existence score: an online-only seller.
  {
    name: 'Shop Online Giá Rẻ',
    category: 'shopping',
    sources: { overture: 'ovt-online-seller' },
    confidence: 0.3,
  },
  { name: 'Bếp Mộc Ẩn', category: 'food', status: 'hidden' },
];

export interface DaLat {
  readonly destinationId: string;
  readonly slug: string;
}

/** Seeds the destination; `suffix` keeps slugs apart when a file seeds more than one. */
export async function seedDaLat(pool: pg.Pool, suffix: string): Promise<DaLat> {
  const slug = `vn-da-lat-${suffix}`;
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO destinations (slug, name, country, tz, currency)
     VALUES ($1, 'Đà Lạt', 'Vietnam', 'Asia/Ho_Chi_Minh', 'VND') RETURNING id`,
    [slug],
  );
  const destinationId = rows[0]?.id as string;
  let step = 0;
  let row = 0;
  const add = async (seed: Seed, mergedInto: string | null = null): Promise<string> => {
    if (seed.besidePrevious !== true) step += 1;
    row += 1;
    const inserted = await pool.query<{ id: string }>(
      `INSERT INTO pois (destination_id, name, category, lat, lng, address, source_ids, confidence,
         brand, status, merged_into_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
      [
        destinationId,
        seed.name,
        seed.category,
        11.9 + step * 0.004 + (seed.besidePrevious === true ? 0.0003 : 0),
        108.44,
        seed.address ?? null,
        // Both sources list it; a source id belongs to one row.
        JSON.stringify(
          seed.sources ?? { fsq_os: `fsq-${slug}-${row}`, overture: `ovt-${slug}-${row}` },
        ),
        seed.confidence ?? 0.9,
        seed.brand ?? null,
        seed.status ?? 'active',
        mergedInto,
      ],
    );
    return inserted.rows[0]?.id as string;
  };
  for (const seed of WELL_KNOWN) await add(seed);
  for (const seed of EVERYDAY) {
    const id = await add(seed);
    if (seed.name === 'Bếp Mộc 01') {
      // The same kitchen listed twice, a few metres apart, and an old record merged into it.
      await add({ name: 'bep moc 01', category: 'food', confidence: 0.5, besidePrevious: true });
      await add({ name: 'Bếp Mộc Cũ', category: 'food' }, id);
    }
  }
  for (const seed of JUNK) await add(seed);
  return { destinationId, slug };
}

export interface PickedRow {
  readonly id: string;
  readonly name: string;
  readonly address: string | null;
  readonly rank: number;
  readonly source: string;
}

export async function picksOf(pool: pg.Pool, destinationId: string): Promise<PickedRow[]> {
  const { rows } = await pool.query<PickedRow>(
    `SELECT id, name, address, pick_rank AS rank, pick_source AS source FROM pois
      WHERE destination_id = $1 AND pick_rank IS NOT NULL ORDER BY pick_rank`,
    [destinationId],
  );
  return rows;
}
