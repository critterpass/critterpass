import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { globalRulesText } from '../src';

describe('global rules module', () => {
  it('matches global-rules.md (run `pnpm --filter @cp/ai gen:prompts` after editing it)', () => {
    const markdown = readFileSync(
      new URL('../src/prompts/global-rules.md', import.meta.url),
      'utf8',
    );
    expect(globalRulesText()).toBe(markdown);
  });
});
