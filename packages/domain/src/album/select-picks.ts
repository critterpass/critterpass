/**
 * The album's picks (3m-2 "BEST · 24"), chosen by code: a traveller's own choice always stands (a
 * photo they picked is in, one they took out stays out); of each near-duplicate cluster only the
 * best photo is a candidate, and a photo the device scored as blurry is not one at all. Then,
 * strongest first: everyone tagged in the album gets up to three photos they are in, every day of
 * the trip gets one, and the best of the rest fill the set. Ties break on the photo id, so the
 * same album always gives the same picks.
 */
import type { PhotoQuality } from './schema';

export const ALBUM_PICKS = 24;
/** Photos each traveller tagged in the album should appear in, when the album has them. */
export const ALBUM_PICKS_PER_PERSON = 3;
/** Below this Laplacian variance a photo reads as blurry and is never a candidate. */
export const ALBUM_BLUR_FLOOR = 60;

export interface PickCandidate {
  readonly id: string;
  readonly local_date: string | null;
  readonly quality: PhotoQuality;
  /** Travellers tagged in it. */
  readonly people: readonly string[];
  /** The guide's score, 0–10, when it looked at the photo; null when it did not. */
  readonly score: number | null;
  /** A traveller's own choice: true picked, false taken out, null none. */
  readonly user_pick: boolean | null;
}

export interface AlbumSelection {
  /** In rank order. */
  readonly picks: readonly string[];
  readonly blurry: number;
  readonly duplicates: number;
}

/** A photo's strength: the guide's score when there is one, else a neutral middle. */
function strength(photo: PickCandidate): number {
  return photo.score ?? 5;
}

function byStrength(a: PickCandidate, b: PickCandidate): number {
  const diff = strength(b) - strength(a);
  if (diff !== 0) return diff;
  const blur = (b.quality.blur ?? 0) - (a.quality.blur ?? 0);
  if (blur !== 0) return blur;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** The candidates the guide may pick from: sharp, and the best of their cluster. */
export function pickCandidates(photos: readonly PickCandidate[]): {
  readonly candidates: PickCandidate[];
  readonly blurry: number;
  readonly duplicates: number;
} {
  let blurry = 0;
  let duplicates = 0;
  const best = new Map<string, PickCandidate>();
  const loose: PickCandidate[] = [];
  for (const photo of [...photos].sort(byStrength)) {
    if (photo.user_pick !== null) continue;
    if (photo.quality.blur !== undefined && photo.quality.blur < ALBUM_BLUR_FLOOR) {
      blurry += 1;
      continue;
    }
    const cluster = photo.quality.dup_cluster;
    if (cluster === undefined) {
      loose.push(photo);
    } else if (best.has(cluster)) {
      duplicates += 1;
    } else {
      best.set(cluster, photo);
    }
  }
  return { candidates: [...loose, ...best.values()].sort(byStrength), blurry, duplicates };
}

export function selectAlbumPicks(
  photos: readonly PickCandidate[],
  limit: number = ALBUM_PICKS,
): AlbumSelection {
  const picked: PickCandidate[] = photos.filter((p) => p.user_pick === true).sort(byStrength);
  const { candidates, blurry, duplicates } = pickCandidates(photos);
  const chosen = new Set(picked.map((p) => p.id));
  const take = (photo: PickCandidate | undefined): boolean => {
    if (photo === undefined || chosen.has(photo.id) || picked.length >= limit) return false;
    chosen.add(photo.id);
    picked.push(photo);
    return true;
  };

  const people = [...new Set(photos.flatMap((p) => p.people))].sort();
  for (const person of people) {
    const count = () => picked.filter((p) => p.people.includes(person)).length;
    for (const photo of candidates) {
      if (count() >= ALBUM_PICKS_PER_PERSON) break;
      if (photo.people.includes(person)) take(photo);
    }
  }
  const days = [...new Set(candidates.map((p) => p.local_date).filter((d) => d !== null))].sort();
  for (const day of days) {
    if (picked.some((p) => p.local_date === day)) continue;
    take(candidates.find((p) => p.local_date === day));
  }
  for (const photo of candidates) take(photo);
  return { picks: [...picked].sort(byStrength).map((p) => p.id), blurry, duplicates };
}
