/**
 * Nothing is booked or held before the crew has seen the plan, so the drafting copy never claims
 * it: the step rows make no hold, price or cancellation claim at all, and no line says the guide
 * booked or held something.
 */
import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const CATALOGS = join(__dirname, '../../../../../../../packages/i18n/locales/en/plan-draft');

function messages(file: string): string[] {
  const po = readFileSync(join(CATALOGS, file), 'utf8');
  return [...po.matchAll(/msgstr "((?:[^"\\]|\\.)+)"/gu)].map((match) => match[1] ?? '');
}

describe('drafting copy claims', () => {
  it('never says the guide booked, reserved or held anything', () => {
    for (const file of ['drafting.po', 'review.po', 'redraft.po']) {
      for (const message of messages(file)) {
        expect(message).not.toMatch(/\b(I|we)(’|')?(ve)?\s+(booked|reserved|held)\b/iu);
      }
    }
  });

  it('keeps hold, price and cancellation claims out of the drafting step rows', () => {
    for (const message of messages('drafting.po')) {
      expect(message).not.toMatch(/\b(held|hold|free cancel\w*|price)\b/iu);
    }
  });
});
