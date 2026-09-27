import path from 'node:path';

import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';

import { moneyFloatGuardConfig } from '../lint/money-float-guard.js';

// A miniature repo root: lets the real rule block run without full type info (the selectors here
// are pure AST, so no tsconfig project is needed at all).
const fixtureRoot = path.resolve(import.meta.dirname, '../lint/fixtures');

const eslint = new ESLint({
  cwd: fixtureRoot,
  overrideConfigFile: true,
  overrideConfig: [
    { files: ['**/*.ts'], languageOptions: { parser: tseslint.parser } },
    ...moneyFloatGuardConfig(),
  ],
});

async function lintAt(relativeFile: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath: path.join(fixtureRoot, relativeFile) });
  return (result?.messages ?? []).map(
    (message) => `${message.ruleId ?? 'parse'}: ${message.message}`,
  );
}

describe('money float guard', () => {
  it('rejects parseFloat in packages/cost-engine/src/money', async () => {
    const errors = await lintAt(
      'packages/cost-engine/src/money/probe.ts',
      "export const amount = parseFloat('12.50');\n",
    );
    expect(errors.some((error) => error.startsWith('no-restricted-syntax'))).toBe(true);
  });

  it('rejects Number(...) in packages/cost-engine/src/fx', async () => {
    const errors = await lintAt(
      'packages/cost-engine/src/fx/probe.ts',
      "export const rate = Number('1.4571');\n",
    );
    expect(errors.some((error) => error.startsWith('no-restricted-syntax'))).toBe(true);
  });

  it('rejects Number(...) in services/worker/src/fx', async () => {
    const errors = await lintAt(
      'services/worker/src/fx/probe.ts',
      "export const rate = Number('20411');\n",
    );
    expect(errors.some((error) => error.startsWith('no-restricted-syntax'))).toBe(true);
  });

  it('still rejects a default export in a money dir (the base selector is not lost)', async () => {
    const errors = await lintAt(
      'packages/cost-engine/src/money/probe.ts',
      'const money = 1n;\nexport default money;\n',
    );
    expect(errors.some((error) => error.startsWith('no-restricted-syntax'))).toBe(true);
  });

  it('allows Number.isInteger and Number.parseFloat (member access, not a call to bare Number/parseFloat)', async () => {
    const errors = await lintAt(
      'packages/cost-engine/src/money/probe.ts',
      "export const isWhole = Number.isInteger(1);\nexport const alt = Number.parseFloat('1');\n",
    );
    expect(errors).toEqual([]);
  });

  it('does not apply outside the money/FX source directories', async () => {
    const errors = await lintAt(
      'packages/domain/src/probe.ts',
      "export const count = Number('3');\n",
    );
    expect(errors).toEqual([]);
  });

  it('does not apply to money test files (only the source dirs are scoped)', async () => {
    const errors = await lintAt(
      'packages/cost-engine/test/money/probe.test.ts',
      "export const rows = Number('3');\n",
    );
    expect(errors).toEqual([]);
  });
});
