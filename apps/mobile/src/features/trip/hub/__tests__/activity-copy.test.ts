import { describe, expect, it } from '@jest/globals';
import { i18n } from '@lingui/core';

import { DOMAIN_EVENT_TYPES, projectActivity } from '@cp/domain';
import { loadCatalog, shippedLocaleCodes, sourceLocale } from '@cp/i18n';

import { activityLine, tickerLines } from '../hub-copy';

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

describe('activity ticker lines', () => {
  it("tells the trip's steps once, as the step it is on, and never repeats a line", async () => {
    i18n.loadAndActivate({
      locale: sourceLocale,
      messages: await loadCatalog(sourceLocale, 'trip/hub'),
    });
    const rows = [
      { id: 'a5', verb: 'moved', actor_name: null },
      { id: 'a4', verb: 'edited', actor_name: 'Mai' },
      { id: 'a3', verb: 'moved', actor_name: null },
      { id: 'a2', verb: 'edited', actor_name: 'Mai' },
      { id: 'a1', verb: 'moved', actor_name: null },
    ];
    expect(tickerLines(rows, 'pre_trip').map(({ row, text }) => [row.id, text])).toEqual([
      ['a5', 'The plan is locked in'],
      ['a4', 'Mai edited the plan'],
    ]);
    expect(tickerLines(rows, 'in_trip')[0]?.text).toBe('The trip has started');
    i18n.loadAndActivate({ locale: 'vi', messages: await loadCatalog('vi', 'trip/hub') });
    expect(tickerLines(rows, 'pre_trip')[0]?.text).toBe('Lịch trình đã chốt');
  });
});
