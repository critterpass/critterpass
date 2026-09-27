import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { collectSourceKeys } from './tolgee-push.js';

const fixturesDir = join(import.meta.dirname, 'fixtures', 'complete', 'locales');

describe('collectSourceKeys', () => {
  it('collects every source-locale key with its catalog as namespace', () => {
    const keys = collectSourceKeys(fixturesDir, 'en');
    expect(keys).toEqual([
      { name: 'common.retry.label', namespace: 'common', translations: { en: 'Try again' } },
      { name: 'common.cancel.label', namespace: 'common', translations: { en: 'Cancel' } },
    ]);
  });

  it('carries a message’s extracted comment as the key’s description', () => {
    const keys = collectSourceKeys(join(import.meta.dirname, 'fixtures', 'with-comment', 'locales'), 'en');
    expect(keys).toEqual([
      {
        name: 'crew.invite.accept',
        namespace: 'common',
        translations: { en: 'Accept' },
        description: 'shown on the crew invite screen',
      },
    ]);
  });

  it('returns an empty list when the source locale has no catalogs', () => {
    expect(collectSourceKeys(fixturesDir, 'xx-XX')).toEqual([]);
  });
});
