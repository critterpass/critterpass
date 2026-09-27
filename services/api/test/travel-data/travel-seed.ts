/**
 * Travel-data rows for api suites: the six live destinations and helpers to place fare cells,
 * snapshots and hazards as the worker jobs would have written them.
 */
import { withSystem } from '@cp/db';
import { TRAVEL_DESTINATIONS } from '@cp/domain';
import type pg from 'pg';

export async function seedLiveDestinations(pool: pg.Pool): Promise<Record<string, string>> {
  const ids: Record<string, string> = {};
  await withSystem(pool, async (tx) => {
    const currencies: Record<string, [string, string]> = {
      bali: ['IDR', 'Asia/Makassar'],
      kyoto: ['JPY', 'Asia/Tokyo'],
      iceland: ['ISK', 'Atlantic/Reykjavik'],
      'mexico-city': ['MXN', 'America/Mexico_City'],
      lisbon: ['EUR', 'Europe/Lisbon'],
      cusco: ['PEN', 'America/Lima'],
    };
    for (const slug of Object.keys(TRAVEL_DESTINATIONS)) {
      const [currency, tz] = currencies[slug] ?? ['USD', 'UTC'];
      const { rows } = await tx.query<{ id: string }>(
        `INSERT INTO destinations (slug, name, coverage, currency, tz) VALUES ($1, $1, 'live', $2, $3)
         ON CONFLICT (slug) DO UPDATE SET currency = EXCLUDED.currency RETURNING id`,
        [slug, currency, tz],
      );
      ids[slug] = rows[0]?.id ?? '';
    }
  });
  return ids;
}

export interface FareCellSeed {
  readonly origin: string;
  readonly dest: string;
  readonly destinationId: string;
  readonly month: string;
  readonly priceMinor: number | null;
  readonly fetchedAt: Date | null;
  readonly departOn?: string;
  readonly returnOn?: string;
}

export async function seedFareCell(pool: pg.Pool, cell: FareCellSeed): Promise<void> {
  const days =
    cell.priceMinor === null
      ? []
      : [
          {
            depart_on: cell.departOn ?? `${cell.month}-11`,
            return_on: cell.returnOn ?? `${cell.month}-19`,
            price_minor: cell.priceMinor,
            transfers: 0,
          },
        ];
  await withSystem(pool, (tx) =>
    tx.query(
      `INSERT INTO fare_cells (origin_iata, dest_iata, destination_id, month, depart_on, return_on,
         price_minor, currency, transfers, duration_min, fastest_duration_min, days, found_at,
         fetched_at, checked_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'USD', 0, 175, 165, $8, $9, $9, now())`,
      [
        cell.origin,
        cell.dest,
        cell.destinationId,
        `${cell.month}-01`,
        cell.priceMinor === null ? null : (cell.departOn ?? `${cell.month}-11`),
        cell.priceMinor === null ? null : (cell.returnOn ?? `${cell.month}-19`),
        cell.priceMinor,
        JSON.stringify(days),
        cell.fetchedAt,
      ],
    ),
  );
}
