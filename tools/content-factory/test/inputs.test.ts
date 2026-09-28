/**
 * The factory's inputs are the design data, the content package, open POI data and cited web
 * research: nothing in it may read supplier adapters or supplier responses.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const SRC = path.join(import.meta.dirname, '..', 'src');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? files(full) : full.endsWith('.ts') ? [full] : [];
  });
}

describe('factory inputs', () => {
  it('never import supplier adapters or read supplier tables', () => {
    const offenders = files(SRC).filter((file) => {
      const text = readFileSync(file, 'utf8');
      return /from '@cp\/suppliers'|services\/api\/src\/suppliers|price_quotes|fare_cells|supplier_calls/u.test(
        text,
      );
    });
    expect(offenders).toEqual([]);
  });

  it('declare no supplier package dependency', () => {
    const pkg = JSON.parse(readFileSync(path.join(SRC, '..', 'package.json'), 'utf8')) as {
      dependencies: Record<string, string>;
    };
    expect(Object.keys(pkg.dependencies)).not.toContain('@cp/suppliers');
  });
});
