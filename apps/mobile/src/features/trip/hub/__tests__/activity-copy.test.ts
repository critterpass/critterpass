import { describe, expect, it } from '@jest/globals';
import { i18n } from '@lingui/core';

import { DOMAIN_EVENT_TYPES, projectActivity } from '@cp/domain';
import { loadCatalog, shippedLocaleCodes, sourceLocale } from '@cp/i18n';

import { activityLine } from '../hub-copy';

/** Every verb the server projects into a trip's activity ticker. */
const VERBS = [
  ...new Set(
    DOMAIN_EVENT_TYPES.flatMap((type) => {
      const projection = projectActivity(type);
      return projection === null ? [] : [projection.verb];
    }),
  ),
];

async function linesIn(locale: string): Promise<Map<string, string>> {
  i18n.loadAndActivate({ locale, messages: await loadCatalog(locale, 'trip/hub') });
  return new Map(VERBS.map((verb) => [verb, activityLine({ verb, actor_name: 'Mai' })]));
}

describe('activity ticker copy', () => {
  it('writes a line of its own for every projected activity, never the event key', async () => {
    expect(VERBS.length).toBeGreaterThan(10);
    const en = await linesIn(sourceLocale);
    const fallback = activityLine({ verb: 'an-unknown-verb', actor_name: 'Mai' });
    for (const verb of VERBS) {
      const line = en.get(verb) ?? '';
      expect({ verb, line }).toEqual({ verb, line: expect.not.stringMatching(/activity\.|_/u) });
      expect({ verb, generic: line === fallback }).toEqual({ verb, generic: false });
    }
  });

  it('translates every activity line wherever the hub is translated', async () => {
    const en = await linesIn(sourceLocale);
    const joined = en.get('joined');
    let checked = 0;
    for (const locale of shippedLocaleCodes.filter((code) => code !== sourceLocale)) {
      const translated = await linesIn(locale);
      // A locale still waiting for its hub translation shows English throughout.
      if (translated.get('joined') === joined) continue;
      checked += 1;
      const untranslated = VERBS.filter((verb) => translated.get(verb) === en.get(verb));
      expect({ locale, untranslated }).toEqual({ locale, untranslated: [] });
    }
    expect(checked).toBeGreaterThan(0);
  });
});
