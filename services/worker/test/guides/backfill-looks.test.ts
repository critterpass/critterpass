/**
 * The guide rows of the critters released before guides came from the catalogue were backfilled by
 * a migration, and re-coloured by a later one that carries each critter's look. It must be the look the release writer computes.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { GUIDE_FACTS } from '@cp/critter-art/guides';
import { describe, expect, it } from 'vitest';

import { critterGuideLook } from '../../src/guides/look';

const MIGRATIONS = path.resolve(import.meta.dirname, '../../../../packages/db/migrations');

describe('the guide backfill', () => {
  it('carries the look the release writer gives every dex critter', () => {
    const file = readdirSync(MIGRATIONS).find((name) =>
      name.endsWith('_guide_accents_from_strongest_colour.sql'),
    );
    expect(file).toBeDefined();
    const sql = readFileSync(path.join(MIGRATIONS, file ?? ''), 'utf8');
    const literal = /\$looks\$([\s\S]*?)\$looks\$/u.exec(sql)?.[1];
    expect(literal).toBeDefined();
    expect(JSON.parse(literal ?? '{}')).toEqual(
      Object.fromEntries(
        GUIDE_FACTS.map((facts) => [
          facts.key,
          critterGuideLook({ key: facts.key, name: facts.name, colours: facts.colours }),
        ]),
      ),
    );
  });
});
