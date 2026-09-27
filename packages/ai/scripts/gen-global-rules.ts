/**
 * Regenerates src/prompts/global-rules.generated.ts from src/prompts/global-rules.md. The Markdown
 * file stays the one place the rules are edited; the generated module is what the gateway imports,
 * so bundled services (tsdown) carry the text instead of reading a file that is not in `dist/`.
 * test/global-rules.test.ts fails when the two drift.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { format, resolveConfig } from 'prettier';

const source = fileURLToPath(new URL('../src/prompts/global-rules.md', import.meta.url));
const target = fileURLToPath(new URL('../src/prompts/global-rules.generated.ts', import.meta.url));

const text = readFileSync(source, 'utf8');
const module = [
  '// Generated from global-rules.md by `pnpm --filter @cp/ai gen:prompts`; edit the Markdown file.',
  `export const GLOBAL_RULES: string = ${JSON.stringify(text)};`,
  '',
].join('\n');
const config = (await resolveConfig(target)) ?? {};
writeFileSync(target, await format(module, { ...config, filepath: target }));
