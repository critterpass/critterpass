/**
 * A pitch in the asker's own language. The guide writes its pitch in English and the crew's other
 * languages follow from the translation sweep; someone whose app is in another language would
 * otherwise read the English card for the seconds that takes. So for that reader the lines are
 * held until they have been said again in their language (the same translation route and
 * glossary as the sweep), shown translated, and the translation is stored with the pitch. Any
 * failure falls back to the lines as written.
 */
import {
  pitchPersona,
  resolvePersonaPack,
  translateGuideLines,
  type Gateway,
  type PitchModelSection,
  type UsageContext,
} from '@cp/ai';
import {
  GUIDE_TEXT_FIELDS,
  GUIDE_TEXT_SRC_KEY,
  guideText,
  guideTextSourceHash,
  pitchGuideTextSource,
  SOURCE_APP_LOCALE,
  type PitchFacts,
  type PitchSections,
} from '@cp/domain';
import type pg from 'pg';

export function readsSourceLanguage(locale: string): boolean {
  return locale === SOURCE_APP_LOCALE;
}

type PitchField = (typeof GUIDE_TEXT_FIELDS)['pitch'][number]['name'];

/** The guide-text field each model line is stored under (reasons in the order written). */
export function fieldsOf(lines: readonly PitchModelSection[]): PitchField[] {
  let reason = 0;
  return lines.map((line) => {
    if (line.s === 'headline') return 'headline';
    if (line.s === 'quote') return 'quote';
    const field = `reason_${Math.min(reason, 2)}` as PitchField;
    reason += 1;
    return field;
  });
}

/** Cached sections as `locale` reads them: the stored translation where it is current. */
export function sectionsFor(sections: PitchSections, i18n: unknown, locale: string): PitchSections {
  if (readsSourceLanguage(locale)) return sections;
  const source = pitchGuideTextSource(sections);
  const read = (field: PitchField, original: string): string =>
    guideText('pitch', source, i18n, field, locale) ?? original;
  return {
    ...sections,
    headline: sections.headline === null ? null : read('headline', sections.headline),
    reasons: sections.reasons.map((reason, index) => ({
      ...reason,
      text: index > 2 ? reason.text : read(`reason_${index}` as PitchField, reason.text),
    })),
    quote: sections.quote === null ? null : read('quote', sections.quote),
  };
}

export interface ReaderLines {
  /** The lines as the reader sees them (translated where the translation was accepted). */
  readonly shown: PitchModelSection[];
  /** Field → translation, when every line was translated; null otherwise. */
  readonly translation: Readonly<Record<string, string>> | null;
}

/** Says the model's lines again in `locale`; on any failure the lines come back as written. */
export async function linesInReaderLanguage(
  gateway: Pick<Gateway, 'callModel'>,
  facts: PitchFacts,
  lines: readonly PitchModelSection[],
  locale: string,
  context: UsageContext,
): Promise<ReaderLines> {
  const asWritten: ReaderLines = { shown: [...lines], translation: null };
  if (lines.length === 0) return asWritten;
  const fields = fieldsOf(lines);
  const specs = new Map<string, (typeof GUIDE_TEXT_FIELDS)['pitch'][number]>(
    GUIDE_TEXT_FIELDS.pitch.map((spec) => [spec.name, spec]),
  );
  try {
    const result = await translateGuideLines(
      gateway,
      {
        pack: resolvePersonaPack(pitchPersona(facts)),
        locale,
        lines: lines.map((line, index) => {
          const spec = specs.get(fields[index] ?? '');
          return {
            id: fields[index] ?? `t${index}`,
            text: line.text,
            max: spec?.max ?? 110,
            ...(spec !== undefined && 'title' in spec ? { title: true } : {}),
          };
        }),
      },
      context,
    );
    const shown = lines.map((line, index) => {
      const text = result.accepted.get(fields[index] ?? '');
      return text === undefined ? line : { ...line, text };
    });
    const complete = fields.every((field) => result.accepted.has(field));
    return {
      shown,
      translation: complete
        ? Object.fromEntries(fields.map((field) => [field, result.accepted.get(field) ?? '']))
        : null,
    };
  } catch {
    return asWritten;
  }
}

export interface ReaderPitch {
  /** The English lines to store (a reason the reader could not get in her language is left out). */
  readonly kept: PitchModelSection[];
  /** What the reader sees: each kept line in her language where there is one. */
  readonly shown: PitchModelSection[];
  /** Field → the reader's text, when every kept line has one; null otherwise. */
  readonly translation: Readonly<Record<string, string>> | null;
}

/**
 * The model's lines for a reader of another language. The model writes each line in her language
 * as well (`local`); a line it gave no valid local text for is said again by the translation
 * route. A reason still only in English is left out when another reason has her language, so the
 * card never mixes languages; a headline or closing line without one stays as written.
 */
export async function pitchForReader(
  gateway: Pick<Gateway, 'callModel'>,
  facts: PitchFacts,
  lines: readonly PitchModelSection[],
  locale: string,
  context: UsageContext,
): Promise<ReaderPitch> {
  const missing = lines.filter((line) => line.local === undefined);
  const filled =
    missing.length === 0
      ? []
      : (await linesInReaderLanguage(gateway, facts, missing, locale, context)).shown;
  let next = 0;
  const withLocal = lines.map((line) => {
    if (line.local !== undefined) return line;
    const said = filled[next];
    next += 1;
    return said === undefined || said.text === line.text ? line : { ...line, local: said.text };
  });
  const anyReason = withLocal.some((line) => line.s === 'reason' && line.local !== undefined);
  const kept = withLocal.filter(
    (line) => !(line.s === 'reason' && line.local === undefined && anyReason),
  );
  const fields = fieldsOf(kept);
  const complete = kept.every((line) => line.local !== undefined);
  return {
    kept: kept.map(({ local: _local, ...line }) => line as PitchModelSection),
    shown: kept.map((line) => (line.local === undefined ? line : { ...line, text: line.local })),
    translation: complete
      ? Object.fromEntries(kept.map((line, index) => [fields[index] ?? '', line.local ?? '']))
      : null,
  };
}

/** Stores the reader's translation with the pitch, keyed to the text it was made from. */
export async function storePitchTranslation(
  tx: pg.PoolClient,
  pitchId: string,
  sections: PitchSections,
  locale: string,
  translation: Readonly<Record<string, string>>,
): Promise<void> {
  const src = guideTextSourceHash('pitch', pitchGuideTextSource(sections));
  await tx.query(
    `UPDATE pitches
        SET i18n = (CASE WHEN i18n->>'${GUIDE_TEXT_SRC_KEY}' = $2 THEN i18n ELSE '{}'::jsonb END)
                   || $3::jsonb
      WHERE id = $1`,
    [pitchId, src, JSON.stringify({ [GUIDE_TEXT_SRC_KEY]: src, [locale]: translation })],
  );
}
