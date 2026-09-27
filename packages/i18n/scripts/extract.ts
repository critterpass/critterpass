/// <reference types="node" />
/**
 * Extracts `t`/`Trans` messages from source into the per-area `.po` catalogs (lingui.config.ts).
 * A thin wrapper (not a bare `lingui extract` package.json script) so the project always runs
 * extraction the same way: obsolete messages removed as source changes, non-zero exit on failure.
 */
import { spawnSync } from 'node:child_process';

const result = spawnSync('lingui', ['extract', '--clean', ...process.argv.slice(2)], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
