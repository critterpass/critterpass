/**
 * The morning briefing's lines in the app's language: a line with a current translation is shown
 * translated, anything else exactly as the guide wrote it.
 */
import { guideTextSourceHash } from '@cp/domain';
import { describe, expect, it } from '@jest/globals';

import { briefingState, type BriefingItemRow, type BriefingRow } from '../briefing-model';

const TODAY = '2026-10-02';
const BRIEFING: BriefingRow = {
  id: 'b1',
  local_date: TODAY,
  status: 'ready',
  fallback_used: 0,
  built_at: '2026-10-02T00:10:00.000Z',
};
const TEXT = 'Leave by 7:10 for the Ba Na Hills cable car.';
const TEXT_VI = 'Đi từ 7:10 để kịp cáp treo Ba Na Hills.';

function line(overrides: Partial<BriefingItemRow> = {}): BriefingItemRow {
  return {
    id: 'l1',
    position: 0,
    icon: 'clock',
    text: TEXT,
    action: 'open',
    target_user_ids: null,
    deep_link: null,
    status: 'open',
    source: 'daily_job',
    i18n: JSON.stringify({
      _src: guideTextSourceHash('briefing_item', { text: TEXT }),
      vi: { text: TEXT_VI },
    }),
    ...overrides,
  };
}

function lines(items: readonly BriefingItemRow[], locale?: string): string[] {
  const state = briefingState({
    briefing: BRIEFING,
    items,
    pending: [],
    today: TODAY,
    offline: false,
    inWindow: true,
    ...(locale === undefined ? {} : { locale }),
  });
  return state.kind === 'ready' ? state.lines.map((l) => l.text) : [];
}

describe('the briefing card', () => {
  it('reads a translated line in Vietnamese and the written line in English', () => {
    expect(lines([line()], 'vi')).toEqual([TEXT_VI]);
    expect(lines([line()], 'en')).toEqual([TEXT]);
    expect(lines([line()])).toEqual([TEXT]);
  });

  it('reads a line with no translation, or one made from other words, as written', () => {
    expect(lines([line({ i18n: null })], 'vi')).toEqual([TEXT]);
    expect(lines([line({ text: 'Leave by 7:40 instead.' })], 'vi')).toEqual([
      'Leave by 7:40 instead.',
    ]);
  });
});
