import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Code, comments, test names and migrations describe behaviour; plan bookkeeping ids stay in plans/ and
 * docs/ (docs/code-standards.md §1 rule 5). Design screen ids (e.g. 3c-9) are allowed as product data.
 */
const repoRoot = path.resolve(import.meta.dirname, '../..');

const bannedIds: { pattern: RegExp; what: string }[] = [
  { pattern: /\bF-\d{3}\b/, what: 'feature id' },
  { pattern: /\bQ-\d{2}[A-Z]?\b/, what: 'open-question id' },
  // C0–C5 are privacy classes (system-architecture.md §5), so only C6–C48 are unambiguous resolution ids.
  { pattern: /\bC(?:[6-9]|[1-3]\d|4[0-8])\b/, what: 'contradiction-resolution id' },
  {
    pattern: /\bD(?:[1-9]|1\d|20)\b(?!\s*(?:array|canvas|context|vector|point|space|model))/i,
    what: 'decision id',
  },
  { pattern: /\bphase[ -]?\d{1,2}\b/i, what: 'phase number' },
  { pattern: /\bT(?:[1-9]|1\d)\b(?:'s)?\s*(?:done|task|—)/, what: 'task id' },
];

const sourceExtensions = /\.(ts|tsx|js|mjs|cjs|py|swift|kt|kts|sql|ya?ml|json|astro|css)$/;
const excluded = /(^|\/)(plans|docs|design|node_modules|fixtures)\//;

function trackedSourceFiles(): string[] {
  const output = execFileSync(
    'git',
    ['ls-files', 'apps', 'packages', 'services', 'tools', 'infra', 'e2e'],
    {
      cwd: repoRoot,
      encoding: 'utf8',
    },
  );
  return output
    .split('\n')
    .filter(
      (file) =>
        sourceExtensions.test(file) && !excluded.test(file) && !file.endsWith('pnpm-lock.yaml'),
    );
}

describe('no plan bookkeeping ids in source', () => {
  it('keeps feature, decision, question, phase and task ids out of code and tests', () => {
    const findings: string[] = [];
    for (const file of trackedSourceFiles()) {
      if (file === 'tools/scripts/no-plan-ids.test.ts') continue;
      const lines = readFileSync(path.join(repoRoot, file), 'utf8').split('\n');
      lines.forEach((line, index) => {
        for (const { pattern, what } of bannedIds) {
          if (pattern.test(line))
            findings.push(`${file}:${index + 1} ${what}: ${line.trim().slice(0, 120)}`);
        }
      });
    }
    expect(findings).toEqual([]);
  });
});
