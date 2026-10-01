/**
 * The proposal copy tells the truth about rooms and privacy: nothing is held for the crew (stays
 * show the member's own free-cancellation date), and no line reports a passive signal about a
 * person (who opened or watched what); only public replies and crew-level counts are shown.
 */
import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const CATALOG = join(__dirname, '../../../../../../packages/i18n/locales/en/proposal.po');

function messages(): string[] {
  const po = readFileSync(CATALOG, 'utf8');
  return [...po.matchAll(/msgstr "((?:[^"\\]|\\.)+)"/gu)].map((match) => match[1] ?? '');
}

describe('proposal copy claims', () => {
  it('has copy to check', () => {
    expect(messages().length).toBeGreaterThan(10);
  });

  it('never says rooms are held', () => {
    for (const message of messages()) {
      expect(message).not.toMatch(/hold the rooms|rooms held|held until/iu);
    }
  });

  it('never reports who opened or watched it', () => {
    for (const message of messages()) {
      expect(message).not.toMatch(/\b(opened|unopened|not opened|watched)\b/iu);
    }
  });
});
