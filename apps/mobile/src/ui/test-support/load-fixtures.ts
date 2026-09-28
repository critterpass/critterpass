/* eslint-disable lingui/no-unlocalized-strings -- Jest-only harness (file names), never bundled or rendered. */
import { readdirSync } from 'node:fs';
import path from 'node:path';

const UI_DIR = path.resolve(__dirname, '..');

function fixtureFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : fixtureFiles(full);
    return entry.name.endsWith('.fixtures.tsx') ? [full] : [];
  });
}

/**
 * Loads every `*.fixtures.tsx` under `src/ui` into the gallery registry, as the gallery's
 * `require.context` does in Metro (Jest has no `require.context`). Returns the files loaded.
 */
export function loadFixtureFiles(): readonly string[] {
  const files = fixtureFiles(UI_DIR);
  files.forEach((file) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- loads each fixture file for its registerFixture side effects
    require(file);
  });
  return files;
}
