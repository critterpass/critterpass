/**
 * A small Kyoto as the importer leaves it: famous sights next to everyday businesses, one chain
 * listed three times and places both open datasets agree on. Enough candidates that selecting six
 * needs the model to score them.
 */
import type pg from 'pg';

const P = (
  name: string,
  category: string,
  lat: number,
  lng: number,
  sources: Record<string, string>,
  address: string | null = null,
) => ({ name, category, lat, lng, sources, address });

export const SELECT_FIXTURE_POIS = [
  P('Kinkaku-ji', 'temple_shrine', 35.03937, 135.72924, {
    fsq_os: 'sel-kinkakuji',
    overture: 'sel-o-kinkakuji',
  }),
  P('Fushimi Inari Taisha', 'temple_shrine', 34.96714, 135.77267, { fsq_os: 'sel-inari' }),
  P('Tanaka Family Shrine', 'temple_shrine', 35.0121, 135.7011, { overture: 'sel-o-small-shrine' }),
  P('Nishiki Market', 'market', 35.00504, 135.76483, {
    fsq_os: 'sel-nishiki',
    overture: 'sel-o-nishiki',
  }),
  P('Starbucks Coffee', 'food', 35.0035, 135.7681, { overture: 'sel-o-sb1' }),
  P('Starbucks Coffee', 'food', 34.9858, 135.7588, { overture: 'sel-o-sb2' }),
  P('Starbucks Coffee', 'food', 35.0116, 135.7681, { overture: 'sel-o-sb3' }),
  P('Hanamikoji Street', 'other', 35.00257, 135.77521, { fsq_os: 'sel-hanamikoji' }),
  P('Kyoto Station', 'transit', 34.9858, 135.75877, {
    fsq_os: 'sel-station',
    overture: 'sel-o-station',
  }),
  P('Arashiyama Bamboo Grove', 'nature', 35.01703, 135.67145, { fsq_os: 'sel-bamboo' }),
  P('Kyoto National Museum', 'museum', 34.98997, 135.77301, { overture: 'sel-o-museum' }),
  P('Pontocho Alley', 'nightlife', 35.00616, 135.77071, { fsq_os: 'sel-pontocho' }),
  P('Sunrise Dental Clinic', 'health', 35.02011, 135.74102, { overture: 'sel-o-dental' }),
  P('Coin Parking 12', 'other', 35.02311, 135.73002, { overture: 'sel-o-parking' }),
  P('Shimogyo Tax Office', 'other', 34.99402, 135.75803, { overture: 'sel-o-tax' }),
  P('Mori Real Estate', 'other', 35.03105, 135.74421, { overture: 'sel-o-estate' }),
];

export async function seedSelectFixture(pool: pg.Pool): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO destinations (slug, name, coverage, tz) VALUES ('kyoto', 'Kyoto', 'live', 'Asia/Tokyo')
     ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
  );
  const destinationId = rows[0]?.id;
  if (destinationId === undefined) throw new Error('destination insert returned no row');
  for (const poi of SELECT_FIXTURE_POIS) {
    await pool.query(
      `INSERT INTO pois (destination_id, name, category, lat, lng, address, source_ids)
       VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT DO NOTHING`,
      [destinationId, poi.name, poi.category, poi.lat, poi.lng, poi.address, poi.sources],
    );
  }
  return destinationId;
}
