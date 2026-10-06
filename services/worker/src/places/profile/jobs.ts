/**
 * The place profile queues (docs/api-contracts-async.md §2.3): `places.profile` (one run per
 * place at a time), `places.profile_translate` (one language of one profile) and
 * `places.profile_warm` (a destination's top places, queued spread out). Model calls are system
 * usage on no user's meter. Without SearXNG or a model key no queue is registered, and the api's
 * sends wait until a worker that has them boots.
 */
import {
  createDecisionClient,
  createGateway,
  createTavilySearch,
  recordUsage,
  translatePlaceProfile,
  type AssertRouteOn,
  type Telemetry,
} from '@cp/ai';
import { withSystem } from '@cp/db';
import {
  PLACES_QUEUES,
  placeProfileTextSchema,
  placesProfileJobSchema,
  placesProfileTranslateJobSchema,
  placesProfileWarmJobSchema,
  placesProfileKey,
  placesProfileTranslateKey,
  placesProfileWarmKey,
} from '@cp/domain';
import type pg from 'pg';

import { defineJob, type AnyJobDefinition } from '../../boss';
import { createAvatarMediaStore } from '../../jobs/avatar/media-store';
import { runPlaceProfile, type PlaceProfileDeps } from './run';
import { createPlaceSearch } from './search';
import { markRunEnded, saveProfileTranslation } from './store';
import { PROFILE_PRIORITY, queueWarmProfiles } from './warm';

export interface PlaceProfileEnv {
  readonly ANTHROPIC_API_KEY?: string | undefined;
  readonly ANTHROPIC_BASE_URL?: string | undefined;
  readonly TYPESAFE_API_KEY?: string | undefined;
  readonly TAVILY_API_KEY?: string | undefined;
  readonly SEARXNG_URL?: string | undefined;
  readonly SEARXNG_ENGINES: string;
  readonly PLACES_SEARCH_GAP_MS: number;
  readonly PLACES_PROFILE_MODEL: 'fast' | 'pro';
  readonly PLACES_PROFILE_DAILY_CAP_USD: number;
  readonly R2_S3_ENDPOINT?: string | undefined;
  readonly R2_BUCKET?: string | undefined;
  readonly R2_ACCESS_KEY_ID?: string | undefined;
  readonly R2_SECRET_ACCESS_KEY?: string | undefined;
}

/** Warm-up jobs from a pitch or a trip: the top 30, one every 20 s. */
export const WARM_LIMIT = 30;
export const WARM_SPACING_SECONDS = 20;

export function placeProfileDeps(
  env: PlaceProfileEnv,
  options: {
    readonly pool: pg.Pool;
    readonly assertRouteOn: AssertRouteOn;
    readonly telemetry?: Telemetry | undefined;
  },
): PlaceProfileDeps | null {
  const apiKey = env.ANTHROPIC_API_KEY;
  if (apiKey === undefined || apiKey === '' || env.SEARXNG_URL === undefined) return null;
  const onUsage = (record: Parameters<typeof recordUsage>[1]) =>
    recordUsage((fn) => withSystem(options.pool, fn), record);
  const shared = {
    onUsage,
    assertRouteOn: options.assertRouteOn,
    ...(options.telemetry === undefined ? {} : { telemetry: options.telemetry }),
  };
  const gateway = createGateway({
    apiKey,
    ...(env.ANTHROPIC_BASE_URL === undefined ? {} : { baseURL: env.ANTHROPIC_BASE_URL }),
    ...shared,
  });
  const bucket =
    env.R2_S3_ENDPOINT && env.R2_BUCKET && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY
      ? createAvatarMediaStore({
          endpoint: env.R2_S3_ENDPOINT,
          bucket: env.R2_BUCKET,
          accessKeyId: env.R2_ACCESS_KEY_ID,
          secretAccessKey: env.R2_SECRET_ACCESS_KEY,
        })
      : undefined;
  return {
    gateway,
    decisions: createDecisionClient({
      apiKey: env.TYPESAFE_API_KEY,
      gateway,
      timeoutMs: 5_000,
      ...shared,
    }),
    search: createPlaceSearch({
      searxUrl: env.SEARXNG_URL,
      engines: env.SEARXNG_ENGINES.split(',')
        .map((e) => e.trim())
        .filter(Boolean),
      gapMs: env.PLACES_SEARCH_GAP_MS,
      pool: options.pool,
      ...(env.TAVILY_API_KEY ? { tavily: createTavilySearch({ apiKey: env.TAVILY_API_KEY }) } : {}),
    }),
    store: bucket,
    tier: env.PLACES_PROFILE_MODEL,
    dailyCapMicros: Math.round(env.PLACES_PROFILE_DAILY_CAP_USD * 1_000_000),
  };
}

export function placeProfileJobs(deps: PlaceProfileDeps | null): AnyJobDefinition[] {
  if (deps === null) return [];
  return [
    defineJob({
      queue: PLACES_QUEUES.profile,
      schema: placesProfileJobSchema,
      singletonKey: (data) => placesProfileKey(data.poi_id),
      // Each run mostly waits on the network and the shared search pace.
      concurrency: 4,
      async handler(data, { pool, job }) {
        try {
          const report = await runPlaceProfile(pool, deps, {
            poiId: data.poi_id,
            ...(data.force === undefined ? {} : { force: data.force }),
            signal: job.signal,
          });
          return { ...report };
        } catch (error) {
          if (job.isFinalAttempt) {
            const message = error instanceof Error ? error.message.slice(0, 300) : 'failed';
            await markRunEnded(pool, data.poi_id, {
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
      queue: PLACES_QUEUES.profileTranslate,
      schema: placesProfileTranslateJobSchema,
      singletonKey: (data) => placesProfileTranslateKey(data.poi_id, data.locale),
      concurrency: 4,
      async handler(data, { pool }) {
        const source = await withSystem(pool, async (tx) => {
          const { rows } = await tx.query<{ text: unknown }>(
            `SELECT texts->'en' AS text FROM place_profiles
              WHERE poi_id = $1 AND status = 'ready' AND NOT texts ? $2`,
            [data.poi_id, data.locale],
          );
          return rows[0] === undefined ? null : placeProfileTextSchema.safeParse(rows[0].text);
        });
        if (source === null || !source.success) return { skipped: 'no_source' };
        const translated = await translatePlaceProfile(deps.gateway, source.data, data.locale, {});
        const saved = await saveProfileTranslation(
          pool,
          data.poi_id,
          data.locale,
          translated.text,
          translated.costMicros,
        );
        return { saved, kept_in_english: translated.kept.length };
      },
    }),
    defineJob({
      queue: PLACES_QUEUES.profileWarm,
      schema: placesProfileWarmJobSchema,
      singletonKey: (data) => placesProfileWarmKey(data.destination_id),
      async handler(data, { pool, boss }) {
        const sent = await queueWarmProfiles(pool, boss, data.destination_id, {
          limit: data.limit ?? WARM_LIMIT,
          priority: data.prefill === true ? PROFILE_PRIORITY.prefill : PROFILE_PRIORITY.warm,
          spacingSeconds: data.spacing_s ?? WARM_SPACING_SECONDS,
          offsetSeconds: data.offset_s ?? 0,
        });
        return { sent };
      },
    }),
  ];
}
