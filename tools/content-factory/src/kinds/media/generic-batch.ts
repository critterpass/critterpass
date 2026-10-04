/**
 * Labelled generic stock for the places of a batch that have no photo of their own: one search
 * per generic subject (generic.ts), shared out among the places that need it.
 */
import { mediaItemSchema, poiRefSubject, type ContentItem } from '@cp/content';

import { GENERIC_TITLE, genericSubjectFor } from './generic';
import type { SourceHttp } from './http';
import { pexelsPhotos, type SourceCandidate } from './pexels';
import { pixabayPhotos } from './pixabay';
import type { MediaPlace } from './places';
import { turnedDown } from './rejected';

export interface StockKeys {
  readonly pexelsKey: string | undefined;
  readonly pixabayKey: string | undefined;
}

/** Results asked of each stock source for one generic subject, at least and at most. */
const GENERIC_PER_QUERY = 6;
const MAX_PER_QUERY = 40;
/** The places one generic photo is spread over, so a deck does not repeat one picture. */
const PLACES_PER_PHOTO = 8;
/** The most subjects a media item holds. */
const MAX_SUBJECTS = 20;
const MIN_PX = 1200;

/**
 * Labelled generic stock for `places` (those without a photo of their own): one search per generic
 * subject, asking for more results the more places need it, shared out among them at about eight
 * places per photo and never more than 20.
 */
export async function genericPhotos(
  http: SourceHttp,
  keys: StockKeys,
  places: readonly MediaPlace[],
  /** Ids already in the release for another subject: a generic photo never doubles as one. */
  taken: ReadonlySet<string> = new Set(),
  /** Filled with the searches a source did not answer (`pixabay: tacos`). */
  unanswered: string[] = [],
): Promise<Map<string, ContentItem<'media'>>> {
  const groups = new Map<string, { query: string; places: MediaPlace[] }>();
  for (const place of places) {
    const subject = genericSubjectFor(place);
    if (subject === null) continue;
    const group = groups.get(subject.key) ?? { query: subject.query, places: [] };
    group.places.push(place);
    groups.set(subject.key, group);
  }
  const byId = new Map<string, ContentItem<'media'>>();
  for (const { query, places: needing } of groups.values()) {
    const lists: SourceCandidate[][] = [];
    const perQuery = Math.min(
      MAX_PER_QUERY,
      Math.max(GENERIC_PER_QUERY, Math.ceil(needing.length / PLACES_PER_PHOTO)),
    );
    // A source that stays busy for one search is left out of it; the other still answers.
    const from = async (source: string, search: Promise<SourceCandidate[]>) => {
      try {
        lists.push(await search);
      } catch {
        unanswered.push(`${source}: ${query}`);
      }
    };
    if (keys.pexelsKey) await from('pexels', pexelsPhotos(http, keys.pexelsKey, query, perQuery));
    if (keys.pixabayKey) {
      await from('pixabay', pixabayPhotos(http, keys.pixabayKey, query, perQuery));
    }
    const found: SourceCandidate[] = [];
    for (let i = 0; lists.some((list) => i < list.length); i += 1) {
      for (const list of lists) {
        const candidate = list[i];
        if (
          candidate !== undefined &&
          !taken.has(candidate.id) &&
          !turnedDown(candidate.id) &&
          Math.max(candidate.width, candidate.height) >= MIN_PX
        ) {
          found.push(candidate);
        }
      }
    }
    if (found.length === 0) continue;
    needing.slice(0, found.length * MAX_SUBJECTS).forEach((place, index) => {
      const candidate = found[index % found.length];
      if (candidate === undefined) return;
      const existing = byId.get(candidate.id);
      const subjects = [...new Set([...(existing?.subjects ?? []), poiRefSubject(place.ref)])];
      if (subjects.length > MAX_SUBJECTS) return;
      byId.set(
        candidate.id,
        mediaItemSchema.parse({
          ...candidate,
          title: `${GENERIC_TITLE}${query}`,
          subjects,
          rank: 0,
        }),
      );
    });
  }
  return byId;
}
