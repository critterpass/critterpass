/**
 * Loads the editorial season files beside this module (`<destination-slug>.json`, each row citing
 * its source and the date it was checked) as drafts: `reviewed_at` stays null, so nothing is served
 * or synced until a content reviewer approves it through `upsert_season_editorial`. Existing rows
 * are never overwritten, so re-seeding cannot undo a reviewer's edits.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { seasonSeedFileSchema, type SeasonSeedFile } from '@cp/domain';
import type pg from 'pg';

import { withSystem } from '../../src/tx';

export function readSeasonSeedFiles(dir: string = import.meta.dirname): SeasonSeedFile[] {
  return readdirSync(dir)
    .filter((file) => file.endsWith('.json'))
    .sort()
    .map((file) => {
      const parsed = seasonSeedFileSchema.parse(
        JSON.parse(readFileSync(path.join(dir, file), 'utf8')),
      );
      if (`${parsed.destination}.json` !== file) {
        throw new Error(`${file} declares destination ${parsed.destination}`);
      }
      return parsed;
    });
}

/** Seeds every season file, or only those of `slugs`. */
export async function seedSeason(pool: pg.Pool, slugs?: readonly string[]): Promise<void> {
  const files = readSeasonSeedFiles().filter(
    (file) => slugs === undefined || slugs.includes(file.destination),
  );
  await withSystem(pool, async (tx) => {
    for (const file of files) {
      const { rows } = await tx.query<{ id: string }>(
        'SELECT id FROM destinations WHERE slug = $1',
        [file.destination],
      );
      const destinationId = rows[0]?.id;
      if (destinationId === undefined) continue;
      for (const month of file.months) {
        await tx.query(
          `INSERT INTO season_months (destination_id, month, crowd_index, price_index, highlight_tag,
             colour_role, source, source_url, sourced_on)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (destination_id, month) DO NOTHING`,
          [
            destinationId,
            month.month,
            month.crowd_index,
            month.price_index,
            month.highlight_tag,
            month.colour_role,
            month.source,
            month.source_url,
            month.sourced_on,
          ],
        );
      }
      for (const event of file.events) {
        await tx.query(
          `INSERT INTO season_events (destination_id, key, kind, name, starts_on, ends_on,
             confidence, source, source_url, sourced_on)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (destination_id, key) DO NOTHING`,
          [
            destinationId,
            event.key,
            event.kind,
            event.name,
            event.starts_on,
            event.ends_on,
            event.confidence,
            event.source,
            event.source_url,
            event.sourced_on,
          ],
        );
      }
    }
  });
}
