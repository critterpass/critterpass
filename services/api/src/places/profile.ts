/**
 * A place page's AI profile (docs/api-contracts.md §5.5 `GET /v1/places/{id}` → `profile`): the
 * stored profile in the reader's language, else English while its translation is queued. A place
 * with no profile yet gets one `places.profile` job (one per place at a time; at most
 * `PROFILE_REQUESTS_PER_HOUR` new places per reader an hour) and answers `pending`; the app reads
 * again. A reviewed note always wins: such a place never gets a profile. A declined or failed run
 * answers `null`, as does a reader past the hourly limit.
 */
import { sendInTx } from '@cp/db';
import {
  isAppLocale,
  PLACES_QUEUES,
  placeProfileTextSchema,
  placesProfileKey,
  placesProfileTranslateKey,
  PLACE_BEST_TIMES,
  PLACE_FACT_KINDS,
  PLACE_MEAL_ROLES,
  PROFILE_SKIPPED_CATEGORIES,
  type PlaceProfileWire,
  type PoiCategory,
} from '@cp/domain';
import type pg from 'pg';
import { z } from 'zod';

import {
  checkRateLimit,
  type RateLimitRedisClient,
  type RateLimitRule,
} from '../abuse/rate-limits';

export const PROFILE_REQUESTS_PER_HOUR: RateLimitRule = { windowSeconds: 3_600, max: 30 };
export const PROFILE_TRANSLATIONS_PER_HOUR: RateLimitRule = { windowSeconds: 3_600, max: 120 };
/** Jobs a reader waits on go ahead of warm-ups and the pre-fill. */
const READER_PRIORITY = 10;

export interface ProfileReadOptions {
  readonly uid: string;
  /** Per-reader limits on new jobs; absent = only the worker's daily cap applies. */
  readonly redis?: RateLimitRedisClient | undefined;
  /** Origin of the media Worker that serves the public `c/` prefix (photos). */
  readonly mediaBaseUrl?: string | undefined;
}

interface ProfileRow {
  readonly status: string;
  readonly texts: Record<string, unknown>;
  readonly meal_role: string | null;
  readonly best_times: string[];
  readonly visit_min: number | null;
  readonly dish: string | null;
  readonly facts: unknown;
  readonly photos: unknown;
  readonly sources: unknown;
  readonly generated_at: Date | null;
}

const factsSchema = z.array(z.object({ kind: z.enum(PLACE_FACT_KINDS), source_url: z.string() }));
const photosSchema = z.array(z.object({ key: z.string(), source_page: z.string() }));
const sourcesSchema = z.array(z.object({ url: z.string(), title: z.string() }));

async function allowed(
  redis: RateLimitRedisClient | undefined,
  door: string,
  uid: string,
  rule: RateLimitRule,
): Promise<boolean> {
  if (redis === undefined) return true;
  try {
    return (await checkRateLimit(redis, `rl:${door}:uid:${uid}`, rule)).allowed;
  } catch {
    // Redis down: the worker's daily cap still bounds the spend.
    return true;
  }
}

function readyWire(row: ProfileRow, locale: string, mediaBaseUrl: string | undefined) {
  const own = placeProfileTextSchema.safeParse(row.texts[locale]);
  const english = placeProfileTextSchema.safeParse(row.texts['en']);
  const text = own.success ? own.data : english.success ? english.data : null;
  if (text === null) return null;
  const facts = factsSchema.safeParse(row.facts);
  const photos = photosSchema.safeParse(row.photos);
  const sources = sourcesSchema.safeParse(row.sources);
  const base = mediaBaseUrl?.replace(/\/+$/u, '');
  return {
    wire: {
      status: 'ready',
      locale: own.success ? locale : 'en',
      whyGo: text.why_go,
      bestTime: text.best_time,
      crowd: text.crowd,
      bestTimes: PLACE_BEST_TIMES.filter((t) => row.best_times.includes(t)),
      mealRole: PLACE_MEAL_ROLES.find((r) => r === row.meal_role) ?? null,
      visitMin: row.visit_min,
      dish: row.dish,
      facts: (facts.success ? facts.data : []).flatMap((fact, i) => {
        const line = text.facts[i];
        return line === undefined || line === ''
          ? []
          : [{ kind: fact.kind, text: line, sourceUrl: fact.source_url }];
      }),
      photos:
        base === undefined || !photos.success
          ? []
          : photos.data.map((p) => ({ url: `${base}/${p.key}`, sourcePage: p.source_page })),
      sources: sources.success ? sources.data : [],
      generatedAt: (row.generated_at ?? new Date()).toISOString(),
    } satisfies PlaceProfileWire,
    translated: own.success,
  };
}

export async function readPlaceProfile(
  tx: pg.PoolClient,
  place: { readonly id: string; readonly category: string; readonly reviewed: boolean },
  readerLocale: string,
  options: ProfileReadOptions,
): Promise<PlaceProfileWire | null> {
  if (place.reviewed || PROFILE_SKIPPED_CATEGORIES.has(place.category as PoiCategory)) return null;
  const { rows } = await tx.query<ProfileRow>(
    `SELECT status, texts, meal_role, best_times, visit_min, dish, facts, photos, sources,
            generated_at
       FROM place_profiles WHERE poi_id = $1`,
    [place.id],
  );
  const row = rows[0];
  if (row === undefined) {
    if (!(await allowed(options.redis, 'place_profile', options.uid, PROFILE_REQUESTS_PER_HOUR))) {
      return null;
    }
    await sendInTx(
      tx,
      PLACES_QUEUES.profile,
      { poi_id: place.id },
      { singletonKey: placesProfileKey(place.id), priority: READER_PRIORITY },
    );
    return { status: 'pending' };
  }
  if (row.status === 'pending') return { status: 'pending' };
  if (row.status !== 'ready') return null;
  const ready = readyWire(row, readerLocale, options.mediaBaseUrl);
  if (ready === null) return null;
  if (
    !ready.translated &&
    readerLocale !== 'en' &&
    isAppLocale(readerLocale) &&
    (await allowed(
      options.redis,
      'place_profile_translate',
      options.uid,
      PROFILE_TRANSLATIONS_PER_HOUR,
    ))
  ) {
    await sendInTx(
      tx,
      PLACES_QUEUES.profileTranslate,
      { poi_id: place.id, locale: readerLocale },
      {
        singletonKey: placesProfileTranslateKey(place.id, readerLocale),
        priority: READER_PRIORITY,
      },
    );
  }
  return ready.wire;
}
