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
    // `D1` is also Cloudflare's database product (the web waitlist runs on it), so product-context
    // uses of it are not decision citations.
    pattern:
      /(?<!Cloudflare )\bD(?:[1-9]|1\d|20)\b(?!-backed)(?!\s*(?:array|canvas|context|vector|point|space|model|database|databases|binding|access|read|reads|write|writes|counter|row|rows|table|tables|query|queries|migrations?)\b)/i,
    what: 'decision id',
  },
  // Requires a separator so wave maths like `phase1` stays legal.
  { pattern: /\bphase[ -]\d{1,2}\b/i, what: 'phase number' },
  { pattern: /\bT(?:[1-9]|1\d)\b(?:'s)?\s*(?:done|task|—)/, what: 'task id' },
];

const sourceExtensions = /\.(ts|tsx|js|mjs|cjs|py|swift|kt|kts|sql|ya?ml|json|astro|css)$/;
// Fixtures and the content factory's batches are recorded data, not code: a Wikimedia thumbnail
// path in a media batch (`/d/d9/…`) reads as a decision id.
const excluded =
  /(^|\/)(plans|docs|design|node_modules|fixtures)\/|^tools\/content-factory\/batches\//;

/** Whether the check reads a tracked file: source outside the bookkeeping and recorded-data folders. */
function isCheckedSource(file: string): boolean {
  return (
    (sourceExtensions.test(file) || file.endsWith('.env.example')) &&
    !excluded.test(file) &&
    !file.endsWith('pnpm-lock.yaml')
  );
}

function trackedSourceFiles(): string[] {
  const output = execFileSync(
    'git',
    ['ls-files', 'apps', 'packages', 'services', 'tools', 'infra', 'e2e'],
    {
      cwd: repoRoot,
      encoding: 'utf8',
    },
  );
  return output.split('\n').filter(isCheckedSource);
}

describe('decision id pattern', () => {
  const decision = bannedIds.find((entry) => entry.what === 'decision id')?.pattern;

  it('flags plan-style decision citations', () => {
    expect(decision?.test('Owned backend, never Supabase (D4).')).toBe(true);
    expect(decision?.test('per D14 the sender router picks WhatsApp first')).toBe(true);
  });

  it('allows Cloudflare D1 as a product name', () => {
    expect(decision?.test('In a Cloudflare D1 database operated by Critterpass.')).toBe(false);
    expect(decision?.test('the join form and its D1-backed waitlist')).toBe(false);
    expect(decision?.test('against a single D1 read per attempt')).toBe(false);
  });
});

describe('files the check reads', () => {
  it('leaves recorded data alone: fixtures and the content factory batches', () => {
    const batch = 'tools/content-factory/batches/media/2026-10-01-media-01.json';
    expect(isCheckedSource(batch)).toBe(false);
    expect(isCheckedSource('apps/mobile/src/data/__tests__/fixtures/media-da-nang.json')).toBe(
      false,
    );
    // The path such a batch records does read as a decision id.
    const thumbnail =
      '"url": "https://upload.wikimedia.org/wikipedia/commons/thumb/d/d9/Cau_Rong.jpg"';
    expect(bannedIds.some(({ pattern }) => pattern.test(thumbnail))).toBe(true);
  });

  it('still reads the content factory code and every other source file', () => {
    expect(isCheckedSource('tools/content-factory/src/cli.ts')).toBe(true);
    expect(isCheckedSource('tools/content-factory/src/batches/media.ts')).toBe(true);
    expect(isCheckedSource('apps/mobile/src/features/plan/__tests__/overview.test.tsx')).toBe(true);
    expect(isCheckedSource('packages/db/migrations/20260927000000_users.sql')).toBe(true);
  });
});

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
    // Reads every tracked source file; CI runners are about 3x slower than a dev machine.
  }, 60_000);
});
