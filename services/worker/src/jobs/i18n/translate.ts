/**
 * `guide_text.translate`: every line the guide wrote for a trip (or a crew's pitches) in each
 * language its readers' apps are in. The sweep reads what exists, works out which rows lack which
 * language, and asks the model once per language per batch of lines, in the trip guide's voice.
 * Each returned line is checked before it is stored (numbers intact, within length, not empty); a
 * line that fails keeps its source text for its readers.
 *
 * Safe to run as often as anything changes: a second run finds nothing missing and makes no model
 * call. With the route switched off nothing is translated and everyone reads the source text.
 */
import {
  packFor,
  REPO_PACKS,
  translateGuideLines,
  TRANSLATE_ROUTE,
  type PersonaPack,
  type TranslateLine,
  type TranslateRejection,
} from '@cp/ai';
import { sendInTx, withSystem } from '@cp/db';
import {
  GUIDE_QUEUES,
  GUIDE_TEXT_FIELDS,
  guideTextLimit,
  RECAP_QUEUES,
  guideTextTranslateJobSchema,
  switchedOffKey,
  type GuideTextFieldSpec,
  type GuideTextTranslateJob,
} from '@cp/domain';

import { defineJob } from '../../boss';
import { guideReader, type GuideRuntime } from '../guide/runtime';
import {
  loadCrewSweep,
  loadTripSweep,
  missingLocales,
  storeTranslation,
  type GuideTextRow,
} from './rows';

/** Rejections that will not change on a retry: remembered, so the line is not asked for again. */
const FINAL_REJECTIONS: ReadonlySet<string> = new Set<TranslateRejection>([
  'empty',
  'too_long',
  'numbers_changed',
  'added_aside',
]);

export interface TranslateOutcome {
  readonly outcome: 'translated' | 'nothing_missing' | 'switched_off' | 'gone';
  readonly calls: number;
  /** Lines stored per language. */
  readonly stored: Readonly<Record<string, number>>;
  /** Lines whose readers keep the source text, per language. */
  readonly kept_source: Readonly<Record<string, number>>;
}

const NOTHING: Omit<TranslateOutcome, 'outcome'> = { calls: 0, stored: {}, kept_source: {} };

interface Sweep {
  readonly pack: () => Promise<PersonaPack>;
  readonly locales: readonly string[];
  readonly rows: readonly GuideTextRow[];
  readonly usage: { readonly tripId?: string; readonly crewId?: string };
}

async function loadSweep(runtime: GuideRuntime, job: GuideTextTranslateJob): Promise<Sweep | null> {
  if ('trip_id' in job) {
    const tripId = job.trip_id;
    const sweep = await withSystem(runtime.pool, (tx) => loadTripSweep(tx, tripId));
    if (sweep === null) return null;
    const { readerUid, guideSlug } = sweep;
    return {
      ...sweep,
      usage: { tripId },
      pack: () =>
        readerUid === null
          ? Promise.resolve(REPO_PACKS.tokek)
          : packFor(guideReader(runtime.pool), readerUid, tripId, guideSlug),
    };
  }
  const sweep = await withSystem(runtime.pool, (tx) => loadCrewSweep(tx, job.crew_id));
  const { readerUid } = sweep;
  return {
    ...sweep,
    usage: { crewId: job.crew_id },
    // A crew without a trip talks to the home guide.
    pack: () =>
      readerUid === null
        ? Promise.resolve(REPO_PACKS.tokek)
        : packFor(guideReader(runtime.pool), readerUid, null, null),
  };
}

interface Pending {
  readonly row: GuideTextRow;
  readonly lines: readonly { readonly field: string; readonly line: TranslateLine }[];
}

/** The rows that lack `locale`, with one line per non-empty field. */
function pendingFor(sweep: Sweep, locale: string): Pending[] {
  let n = 0;
  return sweep.rows
    .filter((row) => missingLocales(row, sweep.locales).includes(locale))
    .map((row) => ({
      row,
      lines: GUIDE_TEXT_FIELDS[row.kind].flatMap((field) => {
        const text = row.source[field.name] ?? '';
        if (text === '') return [];
        n += 1;
        const spec: GuideTextFieldSpec = field;
        const line: TranslateLine = {
          id: `t${n}`,
          text,
          max: guideTextLimit(spec, text),
          ...(spec.title === true ? { title: true } : {}),
        };
        return [{ field: field.name, line }];
      }),
    }))
    .filter((pending) => pending.lines.length > 0);
}

export async function translateGuideText(
  runtime: GuideRuntime,
  job: GuideTextTranslateJob,
): Promise<TranslateOutcome> {
  const sweep = await loadSweep(runtime, job);
  if (sweep === null) return { outcome: 'gone', ...NOTHING };
  const locales = [...new Set(sweep.rows.flatMap((row) => missingLocales(row, sweep.locales)))];
  if (locales.length === 0) return { outcome: 'nothing_missing', ...NOTHING };
  try {
    await runtime.assertRouteOn(TRANSLATE_ROUTE);
  } catch (error) {
    if (switchedOffKey(error) !== undefined) return { outcome: 'switched_off', ...NOTHING };
    throw error;
  }
  const pack = await sweep.pack();
  let calls = 0;
  const stored: Record<string, number> = {};
  const keptSource: Record<string, number> = {};
  for (const locale of locales.sort()) {
    const pending = pendingFor(sweep, locale);
    const result = await translateGuideLines(
      runtime.gateway,
      { pack, locale, lines: pending.flatMap((p) => p.lines.map((entry) => entry.line)) },
      sweep.usage,
    );
    calls += result.calls;
    const final = new Set(
      result.rejected.filter((r) => FINAL_REJECTIONS.has(r.reason)).map((r) => r.id),
    );
    await withSystem(runtime.pool, async (tx) => {
      for (const { row, lines } of pending) {
        // A line the model skipped or garbled this time is asked for again by the next sweep.
        if (lines.some(({ line }) => !result.accepted.has(line.id) && !final.has(line.id)))
          continue;
        const fields: Record<string, string | null> = {};
        for (const { field, line } of lines) {
          const text = result.accepted.get(line.id) ?? null;
          fields[field] = text;
          if (text === null) keptSource[locale] = (keptSource[locale] ?? 0) + 1;
          else stored[locale] = (stored[locale] ?? 0) + 1;
        }
        await storeTranslation(tx, row, locale, fields);
        // A recap's narration follows its words into the new language.
        if (row.kind === 'recap') {
          await sendInTx(tx, RECAP_QUEUES.narrate, { recap_id: row.id }, { singletonKey: row.id });
        }
      }
    });
  }
  return { outcome: 'translated', calls, stored, kept_source: keptSource };
}

export function guideTextTranslateJob(runtime: GuideRuntime) {
  return defineJob({
    queue: GUIDE_QUEUES.translate,
    schema: guideTextTranslateJobSchema,
    singletonKey: (data) => ('trip_id' in data ? data.trip_id : data.crew_id),
    handler: async (data) => ({ ...(await translateGuideText(runtime, data)) }),
  });
}
