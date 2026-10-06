/**
 * The destination brief queues (docs/api-contracts-async.md §2.3): `places.destination_brief`
 * (one run per destination at a time; a ready brief queues the profiles of its places through
 * `places.profile_warm`) and `places.brief_translate` (one language of one brief). Model calls are
 * system usage on no user's meter. They share the place profiles' search, gateway and Jev client,
 * so without SearXNG or a model key no queue is registered.
 */
import { translateBriefLines } from '@cp/ai';
import { withSystem } from '@cp/db';
import {
  PLACES_QUEUES,
  placesBriefTranslateJobSchema,
  placesBriefTranslateKey,
  placesDestinationBriefJobSchema,
  placesDestinationBriefKey,
  placesProfileWarmKey,
} from '@cp/domain';

import { defineJob, type AnyJobDefinition } from '../../boss';
import { runDestinationBrief } from './brief-run';
import { markBriefEnded, saveBriefTranslation } from './brief-store';
import type { PlaceProfileDeps } from './run';

/** The lines of a brief to translate: `e<i>` per essential, `f<i>` per eatery, from English. */
export function briefLines(
  essentials: readonly { why?: Record<string, string> }[],
  eateries: readonly { why?: Record<string, string> }[],
  locale: string,
): { id: string; text: string }[] {
  const pick = (prefix: string) => (entry: { why?: Record<string, string> }, i: number) =>
    entry.why?.en !== undefined && entry.why[locale] === undefined
      ? [{ id: `${prefix}${i}`, text: entry.why.en }]
      : [];
  return [...essentials.flatMap(pick('e')), ...eateries.flatMap(pick('f'))];
}

export function destinationBriefJobs(
  deps: PlaceProfileDeps | null,
  dailyCapUsd: number,
): AnyJobDefinition[] {
  if (deps === null) return [];
  const briefDeps = {
    gateway: deps.gateway,
    decisions: deps.decisions,
    search: deps.search,
    dailyCapMicros: Math.round(dailyCapUsd * 1_000_000),
    ...(deps.fetch === undefined ? {} : { fetch: deps.fetch }),
  };
  return [
    defineJob({
      queue: PLACES_QUEUES.destinationBrief,
      schema: placesDestinationBriefJobSchema,
      singletonKey: (data) => placesDestinationBriefKey(data.destination_id),
      concurrency: 2,
      async handler(data, { pool, job, boss }) {
        try {
          const report = await runDestinationBrief(pool, briefDeps, {
            destinationId: data.destination_id,
            ...(data.force === undefined ? {} : { force: data.force }),
            signal: job.signal,
          });
          if (report.outcome === 'ready') {
            // The brief's places now lead the destination's picks: warm their profiles first.
            await boss.send(
              PLACES_QUEUES.profileWarm,
              { destination_id: data.destination_id },
              { singletonKey: placesProfileWarmKey(data.destination_id) },
            );
          }
          return { ...report };
        } catch (error) {
          if (job.isFinalAttempt) {
            const message = error instanceof Error ? error.message.slice(0, 300) : 'failed';
            await markBriefEnded(pool, data.destination_id, {
              status: 'failed',
              error: message,
              model: null,
              costMicros: 0,
            }).catch(() => undefined);
          }
          throw error;
        }
      },
    }),
    defineJob({
      queue: PLACES_QUEUES.briefTranslate,
      schema: placesBriefTranslateJobSchema,
      singletonKey: (data) => placesBriefTranslateKey(data.destination_id, data.locale),
      concurrency: 2,
      async handler(data, { pool }) {
        const lines = await withSystem(pool, async (tx) => {
          const { rows } = await tx.query<{
            essentials: { why?: Record<string, string> }[];
            eateries: { why?: Record<string, string> }[];
          }>(
            `SELECT essentials, eateries FROM destination_briefs
              WHERE destination_id = $1 AND status = 'ready'`,
            [data.destination_id],
          );
          const row = rows[0];
          return row === undefined ? [] : briefLines(row.essentials, row.eateries, data.locale);
        });
        if (lines.length === 0) return { skipped: 'nothing_to_translate' };
        const translated = await translateBriefLines(deps.gateway, lines, data.locale, {});
        const saved = await saveBriefTranslation(
          pool,
          data.destination_id,
          data.locale,
          translated.lines,
          translated.costMicros,
        );
        return { saved, kept_in_english: lines.length - translated.lines.size };
      },
    }),
  ];
}
