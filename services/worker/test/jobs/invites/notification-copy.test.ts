/**
 * The crew growth pushes are rendered from the notifications catalog, so every message they send
 * must be extracted into it for each locale, not only exist as a source fallback in code.
 */
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('../../../src/jobs/invites/notifications.ts', import.meta.url),
  'utf8',
);
const ids = [...source.matchAll(/id: '(notifications\.[a-z_.]+)'/gu)].map(
  (match) => match[1] ?? '',
);

function catalogIds(locale: string): Set<string> {
  const po = readFileSync(
    new URL(
      `../../../../../packages/i18n/locales/${locale}/notifications/common.po`,
      import.meta.url,
    ),
    'utf8',
  );
  return new Set([...po.matchAll(/^msgid "([^"]+)"$/gmu)].map((match) => match[1] ?? ''));
}

describe('invite notification copy', () => {
  it('sends eight messages', () => {
    expect(ids).toHaveLength(8);
  });

  it.each(['en', 'vi'])('every message is in the %s notifications catalog', (locale) => {
    const catalog = catalogIds(locale);
    expect(ids.filter((id) => !catalog.has(id))).toEqual([]);
  });
});
