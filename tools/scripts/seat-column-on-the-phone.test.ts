import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * `trip_participants.holds_seat` is a generated column: replication does not publish it, so on the
 * phone it is empty for every synced row. A local query that reads it counts nobody (or, behind a
 * `coalesce`, everybody). The app reads who holds a seat from `rsvp` instead, through
 * `apps/mobile/src/data/trips/seat-sql.ts`.
 */
const repoRoot = path.resolve(import.meta.dirname, '../..');
const appSource = 'apps/mobile/src';
const column = /\bholds_seat\b/;

/** Tests and their fixtures may name the column to seed it empty, as sync delivers it. */
const testFolders = /(^|\/)(__tests__|test-support)\//;
/** The device's table definitions are rendered from the server schema, column for column. */
const generatedSchema = 'apps/mobile/src/data/powersync/synced-tables.generated.ts';

function isAppCode(file: string): boolean {
  return /\.(ts|tsx)$/.test(file) && !testFolders.test(file) && file !== generatedSchema;
}

describe('the seat column on the phone', () => {
  it('tells app code from tests and the generated schema', () => {
    expect(isAppCode('apps/mobile/src/features/money/data/queries.ts')).toBe(true);
    expect(isAppCode('apps/mobile/src/features/money/data/__tests__/crew-currency.test.tsx')).toBe(
      false,
    );
    expect(isAppCode('apps/mobile/src/data/trips/test-support/seed-seats.ts')).toBe(false);
    expect(isAppCode(generatedSchema)).toBe(false);
    expect(column.test('WHERE p.holds_seat = 1')).toBe(true);
    expect(column.test("WHERE rsvp NOT IN ('out', 'waitlisted')")).toBe(false);
  });

  it('is read by no app code', { timeout: 60_000 }, () => {
    const files = execFileSync('git', ['ls-files', appSource], {
      cwd: repoRoot,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    })
      .split('\n')
      .filter(isAppCode);
    expect(files.length).toBeGreaterThan(100);
    const offenders = files.filter((file) =>
      column.test(readFileSync(path.join(repoRoot, file), 'utf8')),
    );
    expect(offenders).toEqual([]);
  });
});
