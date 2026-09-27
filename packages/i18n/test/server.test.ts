import { describe, expect, it } from 'vitest';

import type { CatalogRegistry } from '../src/load-catalog';
import { createServerI18n } from '../src/server/index';

const fixtureRegistry: CatalogRegistry = {
  en: {
    server: () => Promise.resolve({ 'server.push.tripBoosted': '{buyer} boosted the trip' }),
    common: () => Promise.resolve({ 'common.retry.label': 'Try again' }),
  },
};

describe('createServerI18n', () => {
  it('merges every requested area into one instance activated for the locale', async () => {
    const i18n = await createServerI18n('en', ['server', 'common'], fixtureRegistry);
    expect(i18n.locale).toBe('en');
    expect(i18n._('common.retry.label')).toBe('Try again');
    expect(i18n._('server.push.tripBoosted', { buyer: 'Maya' })).toBe('Maya boosted the trip');
  });

  it('creates an independent instance per call, safe for concurrent recipients', async () => {
    const [en, other] = await Promise.all([
      createServerI18n('en', ['common'], fixtureRegistry),
      createServerI18n('en', ['common'], fixtureRegistry),
    ]);
    expect(en).not.toBe(other);
    expect(en.locale).toBe('en');
    expect(other.locale).toBe('en');
  });
});
