import path from 'node:path';

import { ESLint } from 'eslint';
import boundaries from 'eslint-plugin-boundaries';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';

import { architectureLintConfig } from '../lint/boundaries.js';

// A miniature repo (apps/, packages/, services/) that lets the real rule blocks run without type info.
const fixtureRoot = path.resolve(import.meta.dirname, '../lint/fixtures');

const eslint = new ESLint({
  cwd: fixtureRoot,
  overrideConfigFile: true,
  overrideConfig: [
    { files: ['**/*.ts'], languageOptions: { parser: tseslint.parser } },
    ...architectureLintConfig(fixtureRoot, boundaries),
  ],
});

async function lintAt(relativeFile: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath: path.join(fixtureRoot, relativeFile) });
  return (result?.messages ?? []).map(
    (message) => `${message.ruleId ?? 'parse'}: ${message.message}`,
  );
}

describe('architecture import rules', () => {
  it('rejects a server-only package imported by name from the mobile app', async () => {
    const errors = await lintAt(
      'apps/mobile/src/lib/probe.ts',
      "import { db } from '@cp/db';\nexport const x = db;\n",
    );
    expect(errors.some((error) => error.startsWith('no-restricted-imports'))).toBe(true);
  });

  it('rejects a server-only package reached by path from the mobile app', async () => {
    const errors = await lintAt(
      'apps/mobile/src/lib/probe.ts',
      "import { db } from '../../../../packages/db/src/index';\nexport const x = db;\n",
    );
    expect(errors.some((error) => error.startsWith('boundaries/dependencies'))).toBe(true);
  });

  it('allows the mobile app to import the domain package', async () => {
    const errors = await lintAt(
      'apps/mobile/src/lib/probe.ts',
      "import { domain } from '../../../../packages/domain/src/index';\nexport const x = domain;\n",
    );
    expect(errors).toEqual([]);
  });

  it('keeps the domain package a leaf', async () => {
    const errors = await lintAt(
      'packages/domain/src/probe.ts',
      "import { db } from '../../db/src/index';\nexport const x = db;\n",
    );
    expect(errors.some((error) => error.startsWith('boundaries/dependencies'))).toBe(true);
  });

  it('allows services to use the database package', async () => {
    const errors = await lintAt(
      'services/api/src/probe.ts',
      "import { db } from '../../../packages/db/src/index';\nexport const x = db;\n",
    );
    expect(errors).toEqual([]);
  });

  it('lets one feature use another only through its index', async () => {
    const internal = await lintAt(
      'apps/mobile/src/features/beta/probe.ts',
      "import { alphaHelper } from '../alpha/internal';\nexport const x = alphaHelper;\n",
    );
    expect(internal.some((error) => error.startsWith('boundaries/dependencies'))).toBe(true);

    const publicApi = await lintAt(
      'apps/mobile/src/features/beta/probe.ts',
      "import { alphaHelper } from '../alpha';\nexport const x = alphaHelper;\n",
    );
    expect(publicApi).toEqual([]);
  });

  it('allows npm dependencies and node built-ins', async () => {
    const errors = await lintAt(
      'packages/domain/src/probe.ts',
      "import path from 'node:path';\nimport { z } from 'zod';\nexport const x = [path.sep, z];\n",
    );
    expect(errors).toEqual([]);
  });
});
