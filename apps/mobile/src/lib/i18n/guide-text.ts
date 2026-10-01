/**
 * Guide-written text as this person reads it. The guide writes in English; synced rows that hold
 * its text (plan days and items, briefing lines, quests, pitches) carry translations in their
 * `i18n` column. A row read through here shows the translation for the app's language when there
 * is a current one, and the text exactly as stored otherwise: in English, for a language not
 * translated yet, and for text someone edited after it was translated.
 *
 *   const text = useGuideText();
 *   text('plan_item', item, 'notes')   // item: the synced row, with `notes` and `i18n`
 *   text('plan_day', day, 'theme')
 *
 * `row` is the synced row, or any object with `i18n` and every text column of its kind (a quest
 * needs both `title` and `body`: the translation is checked against all of the row's source text,
 * and a row missing one reads as changed, i.e. in English). A pitch passes its `sections` (object
 * or JSON text) and reads `headline`, `reason_0`..`reason_2` and `quote`.
 */
import {
  guideText as resolveGuideText,
  pitchGuideTextSource,
  type GuideTextField,
  type GuideTextKind,
  type GuideTextSource,
} from '@cp/domain';
import { useCallback } from 'react';

import { useLocale } from './use-locale';

/**
 * A synced row holding guide text: its text columns (or a pitch's `sections`) and `i18n`. Typed by
 * the one column every such row has, so a row type that never selected `i18n` does not compile;
 * the helpers take it as a type parameter, so a row interface and an inline `{title, body, i18n}`
 * both pass.
 */
export interface GuideTextRow {
  readonly i18n?: unknown;
}

function parseSections(value: unknown): Parameters<typeof pitchGuideTextSource>[0] {
  if (typeof value !== 'string') {
    return typeof value === 'object' && value !== null ? value : {};
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function sourceOf(kind: GuideTextKind, row: GuideTextRow): GuideTextSource {
  const columns: Readonly<Record<string, unknown>> = { ...row };
  if (kind === 'pitch') return pitchGuideTextSource(parseSections(columns['sections']));
  return Object.fromEntries(
    Object.entries(columns).filter(
      (entry): entry is [string, string] => entry[0] !== 'i18n' && typeof entry[1] === 'string',
    ),
  );
}

/** `field` of `row` in `locale`: the current translation, else the source text as stored. */
export function guideText<K extends GuideTextKind, R extends GuideTextRow = GuideTextRow>(
  kind: K,
  row: R,
  field: GuideTextField<K>,
  locale: string,
): string | null {
  return resolveGuideText(kind, sourceOf(kind, row), row.i18n, field, locale);
}

/** `guideText` bound to the app's language; re-renders its caller when the language changes. */
export function useGuideText(): <K extends GuideTextKind, R extends GuideTextRow = GuideTextRow>(
  kind: K,
  row: R,
  field: GuideTextField<K>,
) => string | null {
  const locale = useLocale();
  return useCallback((kind, row, field) => guideText(kind, row, field, locale), [locale]);
}
