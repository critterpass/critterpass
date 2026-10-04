/**
 * Whether a destination has a region pack (its detailed tiles, `<slug>/tiles-v1.pmtiles` beside
 * the world tiles), and which tiles a map should draw because of it. Most destinations have none
 * yet, and a style whose region source points at a file that is not there must never be handed to
 * the map: without a pack the region source reads the world tiles, as it does for a trip with no
 * destination.
 *
 * The rules:
 * - a region file on this phone is drawn as it is, and nothing is asked;
 * - a destination whose pack was seen once is remembered across launches and drawn at once;
 * - anything else draws the world tiles while the tiles host is asked once per launch whether the
 *   pack exists; "it is not there" is the only answer that shows the "on its way" line, and a
 *   check that fails (offline, a server error) shows nothing and is asked again next time.
 */
/* eslint-disable lingui/no-unlocalized-strings -- URLs, storage keys and state names, never copy. */
import type { StyleSpecification } from '@maplibre/maplibre-react-native';
import { useEffect, useState } from 'react';
import { createMMKV } from 'react-native-mmkv';

import criterpassDarkStyleJson from '../../../assets/map-style/critterpass-dark.json';

const darkStyle = criterpassDarkStyleJson as unknown as StyleSpecification;
export const WORLD_SOURCE_URL = (darkStyle.sources['world'] as { url: string }).url;
const CHECK_TIMEOUT_MS = 6000;
const STORE_ID = 'cp-map-regions';

/** What a check found: the pack is there, it is not, or nobody could say. */
export type PackAnswer = 'available' | 'missing' | 'unknown';
export type PackState = PackAnswer | 'checking';

/** The destination's published region tiles, beside the world tiles. */
export function regionTilesUrl(slug: string): string {
  return WORLD_SOURCE_URL.replace(/^pmtiles:\/\//u, '').replace('/world/', `/${slug}/`);
}

export function packAnswerFromStatus(status: number): PackAnswer {
  if (status === 200 || status === 206) return 'available';
  return status === 404 ? 'missing' : 'unknown';
}

export interface RegionTiles {
  /** The `region` source's tiles: the pack, or the world tiles when there is none to draw. */
  readonly sourceUrl: string;
  /** No pack exists for this destination yet: say a detailed map is on its way. */
  readonly awaited: boolean;
}

export function regionTiles(input: {
  readonly destinationSlug: string | null;
  readonly localRegionUri: string | null;
  readonly pack: PackState;
}): RegionTiles {
  if (input.localRegionUri !== null) {
    return { sourceUrl: `pmtiles://${input.localRegionUri}`, awaited: false };
  }
  if (input.destinationSlug === null) return { sourceUrl: WORLD_SOURCE_URL, awaited: false };
  if (input.pack === 'available') {
    return { sourceUrl: `pmtiles://${regionTilesUrl(input.destinationSlug)}`, awaited: false };
  }
  return { sourceUrl: WORLD_SOURCE_URL, awaited: input.pack === 'missing' };
}

/** The dark style with its `region` source reading `sourceUrl`. */
export function regionMapStyle(sourceUrl: string): StyleSpecification {
  return {
    ...darkStyle,
    sources: { ...darkStyle.sources, region: { type: 'vector', url: sourceUrl } },
  };
}

// createMMKV() returns its own in-memory store under Jest, so tests use the real module.
let storage: ReturnType<typeof createMMKV> | undefined;
/** The packs seen so far, kept across launches: a slug is set once its pack has been found. */
export const rememberedPacks = () => (storage ??= createMMKV({ id: STORE_ID }));
const store = rememberedPacks;
/** This launch's answers; "unknown" is never kept, so the next map asks again. */
const answered = new Map<string, 'available' | 'missing'>();
const asking = new Map<string, Promise<PackAnswer>>();

/** What is known without asking: a pack seen on an earlier launch, or this launch's answer. */
export function knownPack(slug: string): 'available' | 'missing' | null {
  const answer = answered.get(slug);
  if (answer !== undefined) return answer;
  return store().getBoolean(slug) === true ? 'available' : null;
}

async function askTilesHost(slug: string, fetcher: typeof fetch): Promise<PackAnswer> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), CHECK_TIMEOUT_MS);
  try {
    const response = await fetcher(regionTilesUrl(slug), { method: 'HEAD', signal: abort.signal });
    return packAnswerFromStatus(response.status);
  } catch {
    return 'unknown';
  } finally {
    clearTimeout(timer);
  }
}

/** Asks the tiles host once per launch whether `slug` has a pack; a pack found is remembered. */
export function checkRegionPack(slug: string, fetcher: typeof fetch = fetch): Promise<PackAnswer> {
  const known = knownPack(slug);
  if (known !== null) return Promise.resolve(known);
  const running = asking.get(slug);
  if (running !== undefined) return running;
  const check = askTilesHost(slug, fetcher).then((answer) => {
    asking.delete(slug);
    if (answer !== 'unknown') answered.set(slug, answer);
    if (answer === 'available') store().set(slug, true);
    return answer;
  });
  asking.set(slug, check);
  return check;
}

/** Forgets every answer, remembered packs included: a clean slate between tests. */
export function forgetRegionPacks(): void {
  answered.clear();
  asking.clear();
  store().clearAll();
}

/**
 * The tiles to draw for a destination. Nothing is asked for a region file on this phone or a trip
 * with no destination; a remembered pack is drawn from the first frame.
 */
export function useRegionTiles(
  destinationSlug: string | null,
  localRegionUri: string | null,
): RegionTiles {
  const asks = destinationSlug !== null && localRegionUri === null;
  const [answer, setAnswer] = useState<{ slug: string; pack: PackAnswer } | null>(null);
  const known = destinationSlug === null ? null : knownPack(destinationSlug);
  useEffect(() => {
    if (!asks || destinationSlug === null || knownPack(destinationSlug) !== null) return undefined;
    let live = true;
    void checkRegionPack(destinationSlug).then((pack) => {
      if (live) setAnswer({ slug: destinationSlug, pack });
    });
    return () => {
      live = false;
    };
  }, [asks, destinationSlug]);
  const pack: PackState =
    known ?? (answer !== null && answer.slug === destinationSlug ? answer.pack : 'checking');
  return regionTiles({ destinationSlug, localRegionUri, pack });
}
