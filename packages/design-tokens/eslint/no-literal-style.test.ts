import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

import { designTokensEslintPlugin } from './index.js';

const eslint = new ESLint({
  overrideConfigFile: true,
  overrideConfig: [
    {
      files: ['**/*.ts', '**/*.tsx'],
      plugins: { critterpass: designTokensEslintPlugin },
      rules: { 'critterpass/no-literal-style': 'error' },
    },
  ],
});

async function lint(code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath: 'fixture.tsx' });
  return (result?.messages ?? []).map(
    (message) => `${message.ruleId ?? 'parse'}: ${message.message}`,
  );
}

describe('critterpass/no-literal-style', () => {
  it('flags a hex colour literal', async () => {
    const errors = await lint("const style = { backgroundColor: '#fff' };\n");
    expect(errors.some((e) => e.includes('no-literal-style') && e.includes('#fff'))).toBe(true);
  });

  it('flags a numeric fontSize', async () => {
    const errors = await lint('const style = { fontSize: 12 };\n');
    expect(errors.some((e) => e.includes('no-literal-style') && e.includes('fontSize'))).toBe(true);
  });

  it('flags a numeric duration', async () => {
    const errors = await lint('const config = { duration: 300 };\n');
    expect(errors.some((e) => e.includes('no-literal-style') && e.includes('duration'))).toBe(true);
  });

  it('flags an 8-digit hex colour literal (with alpha)', async () => {
    const errors = await lint("const style = { backgroundColor: '#ffffffcc' };\n");
    expect(errors.some((e) => e.includes('no-literal-style'))).toBe(true);
  });

  it('flags an rgba() colour literal', async () => {
    const errors = await lint("const style = { backgroundColor: 'rgba(0,0,0,.4)' };\n");
    expect(errors.some((e) => e.includes('no-literal-style'))).toBe(true);
  });

  it('flags a hex colour written as a template literal', async () => {
    const errors = await lint('const style = { backgroundColor: `#fff` };\n');
    expect(errors.some((e) => e.includes('no-literal-style'))).toBe(true);
  });

  it('does not flag a token-sourced colour', async () => {
    const errors = await lint(
      "import { tokens } from '@cp/design-tokens';\nconst style = { backgroundColor: tokens.color.yellow };\n",
    );
    expect(errors.some((e) => e.includes('no-literal-style'))).toBe(false);
  });

  it('does not flag an unrelated numeric property', async () => {
    const errors = await lint('const style = { flex: 1, gap: 8 };\n');
    expect(errors.some((e) => e.includes('no-literal-style'))).toBe(false);
  });

  it('does not flag a non-colour string that merely starts with #', async () => {
    const errors = await lint("const label = '#tag-not-a-colour-name';\n");
    expect(errors.some((e) => e.includes('no-literal-style'))).toBe(false);
  });
});
