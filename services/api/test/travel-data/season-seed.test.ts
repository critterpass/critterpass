/**
 * The editorial season files (packages/db/seed/season/<slug>.json): each is valid for its own
 * destination, covers all twelve months, and every month and event cites a source, a URL and the
 * date it was checked.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { seasonSeedFileSchema, TRAVEL_DESTINATIONS } from '@cp/domain';
import { describe, expect, it } from 'vitest';

const SEED_DIR = path.resolve(import.meta.dirname, '../../../../packages/db/seed/season');
const files = readdirSync(SEED_DIR).filter((file) => file.endsWith('.json'));

describe('editorial season seed files', () => {
  it('exist for every live destination', () => {
    expect(files.map((file) => file.replace('.json', '')).sort()).toEqual(
      Object.keys(TRAVEL_DESTINATIONS).sort(),
    );
  });

  it.each(files)('%s is valid, complete and sourced', (file) => {
    const seed = seasonSeedFileSchema.parse(
      JSON.parse(readFileSync(path.join(SEED_DIR, file), 'utf8')),
    );
    expect(`${seed.destination}.json`).toBe(file);
    expect(seed.months.map((month) => month.month)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
    for (const row of [...seed.months, ...seed.events]) {
      expect(row.source.trim()).not.toBe('');
      expect(row.source_url).toMatch(/^https:\/\//);
      expect(row.sourced_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    expect(seed.months.filter((month) => month.colour_role === 'peak').length).toBeGreaterThan(0);
  });
});
