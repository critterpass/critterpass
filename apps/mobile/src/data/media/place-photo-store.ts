/**
 * The photos of places in long lists, kept for the session by POI id. Ids are asked for as their
 * rows come into view; the store reads them in chunks of the api's subject limit, one chunk at a
 * time, and never reads an id it already has an answer for (a place with no asset is an answer
 * too). A chunk that gets no answer (offline, a server error) is forgotten, so its rows keep their
 * category tile and are asked for again the next time they come into view.
 */
/* eslint-disable lingui/no-unlocalized-strings -- non-UI data layer; subject keys and wire values. */
import { mediaListResponseSchema, type MediaAsset } from '@cp/domain';

import type { TravelDataReader } from '../travel-data/client';
import { mediaPath } from './use-subject-media';

/** The most subjects one `GET /v1/media` takes. */
export const SUBJECTS_PER_READ = 20;

const SUBJECT_REF = /^[a-z0-9-]+$/u;

/** The media subject key of a place's own photos. */
export function poiSubject(poiId: string): string {
  return `poi:${poiId}`;
}

/**
 * The sources whose photos, filed under a place, show the place itself: the content factory files
 * a place's own photos from Wikimedia Commons. A source that supplies photos of the place itself
 * (a partner's listing photos) joins this set.
 */
const OWN_PHOTO_SOURCES: ReadonlySet<MediaAsset['source']> = new Set(['wikimedia']);

/**
 * A photo from any other source (stock) stands for the place only as a generic one (a similar
 * dish, a beach like it), shown as "not this place".
 */
export function isGenericPlacePhoto(photo: MediaAsset): boolean {
  return !OWN_PHOTO_SOURCES.has(photo.source);
}

/** A place's hero, or null once the api has said it has none. Absent while not yet read. */
const answers = new Map<string, MediaAsset | null>();
const asked = new Set<string>();
const queue: string[] = [];
const listeners = new Set<() => void>();
let version = 0;
let draining = false;

export function subscribePlacePhotos(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Changes whenever an answer lands. */
export function placePhotosVersion(): number {
  return version;
}

export function placePhoto(poiId: string): MediaAsset | null {
  return answers.get(poiId) ?? null;
}

async function readChunk(
  reader: TravelDataReader,
  ids: readonly string[],
): Promise<readonly MediaAsset[] | null> {
  try {
    const response = await reader.getJson(mediaPath(ids.map(poiSubject).join(',')));
    if (response.status < 200 || response.status >= 300) return null;
    const parsed = mediaListResponseSchema.safeParse(response.body);
    return parsed.success ? parsed.data.items : null;
  } catch {
    return null;
  }
}

async function drain(reader: TravelDataReader): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    while (queue.length > 0) {
      const ids = queue.splice(0, SUBJECTS_PER_READ);
      const items = await readChunk(reader, ids);
      for (const id of ids) {
        if (items === null) {
          asked.delete(id);
          continue;
        }
        // The read is in rank order: the first asset filed under the place is its hero.
        const subject = poiSubject(id);
        answers.set(id, items.find((item) => item.subjects.includes(subject)) ?? null);
      }
      if (items !== null) {
        version += 1;
        for (const listener of listeners) listener();
      }
    }
  } finally {
    draining = false;
  }
}

/** Asks for the photos of these places; ids already asked for (or not a place's ref) are skipped. */
export function requestPlacePhotos(poiIds: readonly string[], reader: TravelDataReader): void {
  for (const id of poiIds) {
    if (asked.has(id) || !SUBJECT_REF.test(id)) continue;
    asked.add(id);
    queue.push(id);
  }
  if (queue.length > 0) void drain(reader);
}

/** Forgets every answer (tests, sign-out). */
export function resetPlacePhotos(): void {
  answers.clear();
  asked.clear();
  queue.length = 0;
  version += 1;
}
