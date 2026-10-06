/**
 * A place page's AI profile (docs/api-contracts.md §5.5 `GET /v1/places/{id}` → `profile`): the
 * stored profile in the reader's language, else English while its translation is queued. A place
 * with no profile yet gets one `places.profile` job (one per place at a time; at most
 * `PROFILE_REQUESTS_PER_HOUR` new places per reader an hour) and answers `pending`; the app reads
 * again. A reviewed note always wins: such a place never gets a profile. A declined or failed run
 * answers `null`, as does a reader past the hourly limit. A run the worker skipped at its spent
 * daily cap answers `null` and queues nothing until the cap resets at midnight UTC.
 */
import { sendInTx } from '@cp/db';
import {
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
import { locales } from '@cp/i18n';
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
  /** The worker skipped the run at an earlier day's spent cap: queue it again. */
  readonly cap_reset: boolean;
}

const factsSchema = z.array(
  z.object({
    kind: z.enum(PLACE_FACT_KINDS),
    source_url: z.string(),
    second_source: z.string().optional(),
  }),
);

/** A fact the page or a second search confirmed, else one that rests on its own page. */
export function secondSourceOf(stored: string | undefined): 'agrees' | 'own_site' | 'single' {
  return stored === 'agrees' || stored === 'own_site' ? stored : 'single';
}
const photosSchema = z.array(z.object({ key: z.string(), source_page: z.string() }));
const sourcesSchema = z.array(z.object({ url: z.string(), title: z.string() }));

/** Every language the app ships text in (`@cp/i18n`), the pseudo-locale aside. */
const PROFILE_LOCALES: readonly string[] = locales
  .filter((entry) => entry.pseudo !== true)
  .map((entry) => entry.code);

/** The app language a locale tag (`de-DE`, `pt_BR`, `zh-Hant-TW`, `in`) reads in, or null. */
export function profileLocaleOf(tag: string | null | undefined): string | null {
  if (tag === null || tag === undefined || tag.trim() === '') return null;
  const clean = tag.trim().replace(/_/gu, '-').toLowerCase();
  const exact = PROFILE_LOCALES.find((code) => code.toLowerCase() === clean);
  if (exact !== undefined) return exact;
  const primary = clean.split('-')[0] ?? '';
  const language = primary === 'in' ? 'id' : primary;
  return PROFILE_LOCALES.find((code) => code.toLowerCase().split('-')[0] === language) ?? null;
}

/**
 * The reader's language for a profile, from any of the app's languages (not only those the server
 * writes its own copy in): the chosen app language, else the latest device's, else the account's.
 */
export async function profileReaderLocale(tx: pg.PoolClient, uid: string): Promise<string> {
  const { rows } = await tx.query<{ tags: (string | null)[] }>(
    `SELECT ARRAY[
       (SELECT s.app_locale FROM user_settings s WHERE s.user_id = $1),
       (SELECT d.locale FROM devices d WHERE d.user_id = $1
         ORDER BY d.last_seen_at DESC NULLS LAST LIMIT 1),
       (SELECT u.locale FROM users u WHERE u.id = $1)
     ] AS tags`,
    [uid],
  );
  for (const tag of rows[0]?.tags ?? []) {
    const locale = profileLocaleOf(tag);
    if (locale !== null) return locale;
  }
  return 'en';
}

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
          : [
              {
                kind: fact.kind,
                text: line,
                sourceUrl: fact.source_url,
                secondSource: secondSourceOf(fact.second_source),
              },
            ];
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
  options: ProfileReadOptions,
): Promise<PlaceProfileWire | null> {
  if (place.reviewed || PROFILE_SKIPPED_CATEGORIES.has(place.category as PoiCategory)) return null;
  const { rows } = await tx.query<ProfileRow>(
    `SELECT status, texts, meal_role, best_times, visit_min, dish, facts, photos, sources,
            generated_at,
            status = 'failed' AND error = 'daily_cap'
              AND updated_at < date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
              AS cap_reset
       FROM place_profiles WHERE poi_id = $1`,
    [place.id],
  );
  const row = rows[0];
  if (row === undefined || row.cap_reset) {
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
  const readerLocale = await profileReaderLocale(tx, options.uid);
  const ready = readyWire(row, readerLocale, options.mediaBaseUrl);
  if (ready === null) return null;
  if (
    !ready.translated &&
    readerLocale !== 'en' &&
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
