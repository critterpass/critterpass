import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { critters } from './critters';
import { critterDrawings } from './drawings';

describe('critter drawings', () => {
  it('match the catalogue row for row (re-run `pnpm --filter @cp/critter-art drawings`)', () => {
    expect(critterDrawings).toEqual(critters.map(({ id, kind, spec }) => ({ id, kind, spec })));
  });

  it('say nothing about who a critter is', () => {
    const source = readFileSync(new URL('./drawings.ts', import.meta.url), 'utf8');
    for (const critter of critters) {
      expect(source, critter.name).not.toContain(`"${critter.name}"`);
      expect(source, critter.species).not.toContain(`"${critter.species}"`);
      expect(source, critter.city).not.toContain(`"${critter.city}"`);
    }
  });
});
