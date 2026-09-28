import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from '@jest/globals';

import { BUNDLED_FONT_FAMILIES } from './load';

const mobileRoot = join(__dirname, '..', '..', '..');

describe('bundled fonts', () => {
  it('lists every font file the app ships', () => {
    const files = readdirSync(join(mobileRoot, 'assets', 'fonts'))
      .filter((name) => name.endsWith('.ttf'))
      .map((name) => name.slice(0, -'.ttf'.length));
    expect([...BUNDLED_FONT_FAMILIES].sort()).toEqual(files.sort());
  });

  it('embeds every family natively through the expo-font config plugin', () => {
    const appConfig = readFileSync(join(mobileRoot, 'app.config.ts'), 'utf8');
    const embedded = [...appConfig.matchAll(/'\.\/assets\/fonts\/([^']+)\.ttf'/g)].map(
      (match) => match[1],
    );
    expect(embedded.sort()).toEqual([...BUNDLED_FONT_FAMILIES].sort());
  });
});
