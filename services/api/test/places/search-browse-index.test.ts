import { readdirSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { LOW_QUALITY, QUALITY_SCORE } from '../../src/places/search';

const migrationsDir = new URL('../../../../packages/db/migrations/', import.meta.url);

/** Index expressions name bare columns; the query qualifies them with `p.`. Whitespace is free. */
function normalize(sql: string): string {
  return sql.replaceAll('p.', '').replaceAll(/\s+/gu, '');
}

describe('no-query browse index', () => {
  it('repeats the ranking expressions search orders and filters a browse by', () => {
    const file = readdirSync(migrationsDir).find((name) =>
      name.endsWith('_pois_destination_search_indexes.sql'),
    );
    expect(file).toBeDefined();
    const migration = normalize(readFileSync(new URL(file ?? '', migrationsDir), 'utf8'));

    expect(migration).toContain(`${normalize(QUALITY_SCORE)}DESC`);
    expect(migration).toContain(`ANDNOT${normalize(LOW_QUALITY)}`);
  });
});
