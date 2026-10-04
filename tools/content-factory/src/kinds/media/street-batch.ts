/**
 * Street-level photos for the places a batch leaves with nothing (`--opt street=on`): for each,
 * the Mapillary images that can show it by geometry (mapillary.ts), newest first, each looked at
 * by the vision check (photo-check.ts) until one is kept. Mapillary's file links expire within
 * hours, so every image looked at is saved beside the batch at proposal time: the review pages
 * and the check read that copy. The pass rate per destination goes on the review pages.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { mediaItemSchema, poiRefSubject, type ContentItem } from '@cp/content';

import { USER_AGENT, type SourceHttp } from './http';
import {
  streetCandidate,
  streetCandidates,
  streetImagesNear,
  type StreetCandidate,
} from './mapillary';
import { checkCopy, checkPhoto, type PhotoCheckDeps } from './photo-check';
import type { MediaPlace } from './places';

/** A file must be this wide or tall to pass the release's resolution rule. */
const MIN_PX = 1200;

export interface StreetDeps {
  readonly http: SourceHttp;
  readonly token: string;
  readonly check: PhotoCheckDeps;
  /** Where the looked-at images are kept, as `mapillary-photo-<id>.jpg`. */
  readonly filesDir: string;
  /** The most vision checks one run may make. */
  readonly maxChecks: number;
}

/** What the page shows for a kept street photo. */
export interface StreetPick {
  readonly distanceM: number;
  readonly year: number;
  readonly reason: string;
}

/** How a destination's places without a photo fared. */
export interface StreetTally {
  /** Places with no other photo. */
  places: number;
  /** ... that Mapillary has any image near. */
  covered: number;
  /** ... with an image that fits by geometry. */
  fitting: number;
  /** ... with a photo the check kept. */
  kept: number;
  /** Images the check looked at, and how many it kept. */
  checked: number;
}

export interface StreetBatch {
  readonly items: readonly ContentItem<'media'>[];
  readonly picks: ReadonlyMap<string, StreetPick>;
  readonly tallies: Readonly<Record<string, StreetTally>>;
  readonly costMicros: number;
  /** Places left unchecked because the run reached its limit of checks. */
  readonly skipped: number;
}

/** The saved copy of an image, downloaded now if it is not there yet; null when it cannot be had. */
async function savedCopy(deps: StreetDeps, candidate: StreetCandidate): Promise<Buffer | null> {
  const file = path.join(deps.filesDir, `mapillary-photo-${candidate.image.id}.jpg`);
  if (existsSync(file)) return readFileSync(file);
  try {
    const response = await deps.http.fetch(candidate.image.preview, {
      headers: { 'user-agent': USER_AGENT },
    });
    if (!response.ok) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    mkdirSync(deps.filesDir, { recursive: true });
    writeFileSync(file, bytes);
    return bytes;
  } catch {
    return null;
  }
}

/** What one place's search and checks came to. */
interface PlaceResult {
  readonly covered: boolean;
  readonly fitting: boolean;
  readonly checked: number;
  readonly costMicros: number;
  readonly kept: { readonly candidate: StreetCandidate; readonly reason: string } | null;
}

async function streetPhotoFor(deps: StreetDeps, place: MediaPlace): Promise<PlaceResult> {
  const images = await streetImagesNear(deps.http, deps.token, place);
  const candidates = streetCandidates(place, images).filter(
    (c) => Math.max(c.image.width, c.image.height) >= MIN_PX,
  );
  let checked = 0;
  let costMicros = 0;
  for (const candidate of candidates) {
    const bytes = await savedCopy(deps, candidate);
    const copy = bytes === null ? null : await checkCopy(bytes);
    if (copy === null) continue;
    const check = await checkPhoto(deps.check, candidate.image.id, copy, place);
    checked += 1;
    costMicros += check.costMicros;
    if (check.accepted) {
      return {
        covered: true,
        fitting: true,
        checked,
        costMicros,
        kept: { candidate, reason: check.reason },
      };
    }
  }
  return {
    covered: images.length > 0,
    fitting: candidates.length > 0,
    checked,
    costMicros,
    kept: null,
  };
}

/** Places worked on at once: the searches and checks are slow, and the sources allow far more. */
const AT_ONCE = 4;

export async function streetPhotos(
  deps: StreetDeps,
  places: readonly MediaPlace[],
): Promise<StreetBatch> {
  const results = new Map<string, PlaceResult>();
  let checks = 0;
  let next = 0;
  const work = async () => {
    while (next < places.length && checks < deps.maxChecks) {
      const place = places[next];
      next += 1;
      if (place === undefined) break;
      const result = await streetPhotoFor(deps, place);
      checks += result.checked;
      results.set(place.ref, result);
    }
  };
  await Promise.all(Array.from({ length: AT_ONCE }, work));
  const byId = new Map<string, ContentItem<'media'>>();
  const picks = new Map<string, StreetPick>();
  const tallies: Record<string, StreetTally> = {};
  let costMicros = 0;
  let skipped = 0;
  for (const place of places) {
    const tally = (tallies[place.destination] ??= {
      places: 0,
      covered: 0,
      fitting: 0,
      kept: 0,
      checked: 0,
    });
    tally.places += 1;
    const result = results.get(place.ref);
    if (result === undefined) {
      skipped += 1;
      continue;
    }
    tally.covered += Number(result.covered);
    tally.fitting += Number(result.fitting);
    tally.checked += result.checked;
    costMicros += result.costMicros;
    if (result.kept === null) continue;
    const { candidate, reason } = result.kept;
    tally.kept += 1;
    picks.set(place.ref, { distanceM: candidate.distanceM, year: candidate.year, reason });
    const source = streetCandidate(candidate.image);
    const held = byId.get(source.id);
    const subjects = [...new Set([...(held?.subjects ?? []), poiRefSubject(place.ref)])];
    const title =
      `${place.name} · street view, ${String(candidate.distanceM)} m away, ${String(candidate.year)}: ${reason}`.slice(
        0,
        300,
      );
    byId.set(
      source.id,
      mediaItemSchema.parse({ ...source, title: held?.title ?? title, subjects, rank: 0 }),
    );
  }
  return { items: [...byId.values()], picks, tallies, costMicros, skipped };
}
