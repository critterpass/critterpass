/**
 * One place's profile run (`places.profile`). Jev's labels, the web search with our own fetch of
 * the top two pages, and the photos start together; only the write waits for the pages. The
 * checked text is saved (and readable) as soon as the write is done; the second source runs only
 * when the write proposed a fee, hours or a closure for a kind that has them, and the photos land
 * last: they are downloaded only once the profile is accepted, so a declined run stores none. A
 * reviewed note always wins: such a place, a skipped kind, an existing profile (unless forced) or a
 * spent daily cap ends the run before anything is called; a spent cap is marked on the place so
 * its readers queue nothing more until the cap resets at midnight UTC.
 */
import {
  buildPlaceProfileRequest,
  checkPlaceProfileReply,
  checkSecondSource,
  isDeclined,
  labelPlace,
  MODEL_IDS,
  parseStructuredText,
  PLACE_PROFILE_ROUTES,
  textOf,
  wantsSecondSource,
  type DecisionClient,
  type Gateway,
  type PlaceLabels,
  type PlaceProfileTier,
  type SecondSourceResult,
} from '@cp/ai';
import {
  PROFILE_SKIPPED_CATEGORIES,
  profileSourceLocales,
  SECOND_SOURCE_CATEGORIES,
  type PoiCategory,
} from '@cp/domain';
import type pg from 'pg';

import type { AvatarMediaStore } from '../../jobs/avatar/media-store';
import { findPhotoHits, gatherPages, keepPhotos, profilePlace } from './evidence';
import type { ImageHit, PlaceSearch } from './search';
import {
  loadProfileTarget,
  markCapped,
  markRunEnded,
  markRunStarted,
  saveProfileFacts,
  saveProfilePhotos,
  saveProfileText,
  spentTodayMicros,
  type ProfileTarget,
} from './store';

export interface PlaceProfileDeps {
  readonly gateway: Pick<Gateway, 'callModel'>;
  readonly decisions: Pick<DecisionClient, 'decide'>;
  readonly search: PlaceSearch;
  /** The media bucket; without it the profile has no photos. */
  readonly store?: Pick<AvatarMediaStore, 'put'> | undefined;
  readonly tier: PlaceProfileTier;
  readonly dailyCapMicros: number;
  readonly fetch?: typeof fetch;
  readonly now?: () => Date;
}

export interface PlaceProfileInput {
  readonly poiId: string;
  readonly force?: boolean;
  readonly signal?: AbortSignal;
  readonly jobId?: string;
}

export type PlaceProfileReport =
  | { readonly outcome: 'skipped'; readonly reason: string }
  | { readonly outcome: 'declined'; readonly reason: string; readonly costMicros: number }
  | {
      readonly outcome: 'ready';
      readonly facts: number;
      readonly dropped: number;
      readonly photos: number;
      readonly secondSource: boolean;
      readonly costMicros: number;
      readonly seconds: number;
    };

/** Why a run would not start, or null when it should. */
export function skipReason(
  target: ProfileTarget | null,
  force: boolean,
  spentMicros: number,
  capMicros: number,
): string | null {
  if (target === null) return 'missing';
  if (target.reviewed) return 'reviewed';
  if (PROFILE_SKIPPED_CATEGORIES.has(target.category as PoiCategory)) return 'kind';
  if (!force && (target.status === 'ready' || target.status === 'declined')) return 'exists';
  if (spentMicros >= capMicros) return 'daily_cap';
  return null;
}

const seconds = (from: number) => Math.round((performance.now() - from) / 100) / 10;

export async function runPlaceProfile(
  pool: pg.Pool,
  deps: PlaceProfileDeps,
  input: PlaceProfileInput,
): Promise<PlaceProfileReport> {
  const now = deps.now ?? (() => new Date());
  const target = await loadProfileTarget(pool, input.poiId);
  const skip = skipReason(
    target,
    input.force === true,
    target === null ? 0 : await spentTodayMicros(pool, now()),
    deps.dailyCapMicros,
  );
  if (skip === 'daily_cap' && target !== null) await markCapped(pool, target.id, now());
  if (skip !== null || target === null) return { outcome: 'skipped', reason: skip ?? 'missing' };

  await markRunStarted(pool, target.id, now());
  const started = performance.now();
  const usage = input.jobId === undefined ? {} : { jobId: input.jobId };
  const signal = input.signal;
  const locales = profileSourceLocales(target.country);
  const place = profilePlace(target);
  const model = MODEL_IDS[deps.tier];

  const labelsP: Promise<PlaceLabels | null> = labelPlace(
    deps.decisions,
    {
      name: target.name,
      nameLocal: target.nameLocal,
      tags: target.tags,
      sources: target.sources,
      website: target.website,
    },
    usage,
  ).catch(() => null);
  const hitsP = findPhotoHits(target, deps, signal).catch(() => [] as ImageHit[]);

  const pages = await gatherPages(target, deps, signal);
  const searchSeconds = seconds(started);
  if (pages.length === 0) {
    await markRunEnded(pool, target.id, {
      status: 'declined',
      error: 'no_pages',
      model: null,
      costMicros: 0,
    });
    return { outcome: 'declined', reason: 'no_pages', costMicros: 0 };
  }
  const write = await deps.gateway.callModel(
    PLACE_PROFILE_ROUTES[deps.tier],
    {
      ...buildPlaceProfileRequest(place, pages, locales),
      ...(signal === undefined ? {} : { signal }),
    },
    usage,
  );
  const raw = isDeclined(write.message)
    ? { decision: 'decline' }
    : parseStructuredText(textOf(write.message));
  const checked = checkPlaceProfileReply(raw, {
    pages,
    locales,
    second: null,
    website: target.website,
  });
  const labels = await labelsP;
  const labelCost = labels?.costMicros ?? 0;
  if (checked.decision !== 'write') {
    const reason = checked.decision === 'decline' ? 'declined' : 'unreadable';
    await markRunEnded(pool, target.id, {
      status: 'declined',
      error: reason,
      model,
      costMicros: write.costMicros + labelCost,
    });
    return { outcome: 'declined', reason, costMicros: write.costMicros + labelCost };
  }
  const sources = pages.map((p) => ({ url: p.url, title: p.title }));
  await saveProfileText(pool, target.id, {
    texts: checked.texts,
    category: labels?.category ?? null,
    mealRole: labels?.mealRole ?? checked.mealRole,
    bestTimes:
      labels !== null && labels.bestTimes.length > 0 ? labels.bestTimes : checked.bestTimes,
    visitMin: checked.visitMin,
    dish: checked.dish,
    facts: checked.facts,
    dropped: checked.dropped,
    sources,
    model,
    costMicros: write.costMicros + labelCost,
    timings: { search_s: searchSeconds, text_s: seconds(started) },
  });

  let second: SecondSourceResult | null = null;
  let final = checked;
  const asksSecond =
    wantsSecondSource(raw) && SECOND_SOURCE_CATEGORIES.has(target.category as PoiCategory);
  if (asksSecond) {
    second = await checkSecondSource(deps.gateway, place, {
      ...(signal === undefined ? {} : { signal }),
      usage,
    }).catch(() => null);
    const again = checkPlaceProfileReply(raw, {
      pages,
      locales,
      second: second?.answer ?? null,
      website: target.website,
    });
    if (again.decision === 'write') final = again;
    await saveProfileFacts(pool, target.id, {
      texts: final.texts,
      facts: final.facts,
      dropped: final.dropped,
      second: second === null ? null : { answer: second.answer, urls: second.urls },
      costMicros: second?.costMicros ?? 0,
      timings: { second_source_s: seconds(started) },
    });
  }

  const photos = await keepPhotos(target.id, await hitsP, deps, signal).catch(() => []);
  await saveProfilePhotos(pool, target.id, photos, { photos_s: seconds(started) });
  return {
    outcome: 'ready',
    facts: final.facts.length,
    dropped: final.dropped.length,
    photos: photos.length,
    secondSource: asksSecond,
    costMicros: write.costMicros + labelCost + (second?.costMicros ?? 0),
    seconds: seconds(started),
  };
}
