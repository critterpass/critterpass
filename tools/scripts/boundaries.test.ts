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

  it('keeps supplier content types out of the AI package', async () => {
    const byName = await lintAt(
      'packages/ai/src/probe.ts',
      "import type { SupplierOffer } from '@cp/suppliers';\nexport type X = SupplierOffer;\n",
    );
    expect(byName.some((error) => error.startsWith('no-restricted-imports'))).toBe(true);

    const byPath = await lintAt(
      'packages/ai/src/probe.ts',
      "import type { SupplierOffer } from '../../suppliers/src/index';\nexport type X = SupplierOffer;\n",
    );
    expect(byPath.some((error) => error.startsWith('boundaries/dependencies'))).toBe(true);
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

  it('lets the planning register import a feature register module and nothing else', async () => {
    const at = 'apps/mobile/src/features/planning-register.ts';
    const registers = await lintAt(
      at,
      "import '../features/alpha/register';\nimport './alpha/places/register';\n",
    );
    expect(registers).toEqual([]);

    const internal = await lintAt(
      at,
      "import { alphaHelper } from './alpha/internal';\nexport const x = alphaHelper;\n",
    );
    expect(internal.some((error) => error.startsWith('boundaries/dependencies'))).toBe(true);

    const otherFeature = await lintAt(
      'apps/mobile/src/features/beta/probe.ts',
      "import '../alpha/register';\n",
    );
    expect(otherFeature.some((error) => error.startsWith('boundaries/dependencies'))).toBe(true);
  });

  it('allows npm dependencies and node built-ins', async () => {
    const errors = await lintAt(
      'packages/domain/src/probe.ts',
      "import path from 'node:path';\nimport { z } from 'zod';\nexport const x = [path.sep, z];\n",
    );
    expect(errors).toEqual([]);
  });

  it('lets any layer load binary assets', async () => {
    const errors = await lintAt(
      'apps/mobile/src/lib/probe.ts',
      "import font from '../../assets/fonts/Archivo.ttf';\nexport const x = font;\n",
    );
    expect(errors).toEqual([]);
  });

  it('lets the motion layer load the in-house sound-art caf/ogg audio assets', async () => {
    const errors = await lintAt(
      'apps/mobile/src/motion/probe.ts',
      "import sfx from '../../assets/sfx/thud-heavy.caf';\nexport const x = sfx;\n",
    );
    expect(errors).toEqual([]);
  });

  it('lets the motion layer load the Android-only ogg SFX from a platform module', async () => {
    const errors = await lintAt(
      'apps/mobile/src/motion/feedback/probe.android.ts',
      "import sfx from '../../../assets/sfx/thud-heavy.ogg';\nexport const x = sfx;\n",
    );
    expect(errors).toEqual([]);
  });
});
