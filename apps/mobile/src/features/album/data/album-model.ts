/**
 * The album as the screen shows it, from the synced rows: the three segments (the guide's and the
 * crew's picks, everything, and by person), day sections named after the plan's day ("DAY 4 ·
 * BATUR SUNRISE"), and the masonry rows each section lays out (one large photo with two small
 * ones, a wide one with a small one, then whatever is left in an even row).
 */

export type AlbumSegment = 'best' | 'all' | 'people';

export interface AlbumPhoto {
  readonly id: string;
  readonly uploaderId: string;
  readonly thumbKey: string | null;
  readonly displayKey: string | null;
  readonly mediaKey: string;
  /** The trip-clock day it was taken (YYYY-MM-DD), when known. */
  readonly localDate: string | null;
  readonly takenAt: string | null;
  readonly createdAt: string;
  readonly isPick: boolean;
  /** `pending`, `uploaded`, `processed` or `failed`. */
  readonly uploadState: string;
  readonly width: number | null;
  readonly height: number | null;
}

export interface AlbumPerson {
  readonly id: string;
  readonly name: string;
  readonly colour: string | null;
}

export interface PlanDay {
  readonly date: string;
  readonly dayNo: number;
  readonly theme: string | null;
}

export interface DaySection {
  readonly key: string;
  readonly date: string | null;
  readonly dayNo: number | null;
  readonly theme: string | null;
  readonly photos: readonly AlbumPhoto[];
}

export type MasonryRow =
  | { readonly kind: 'feature'; readonly large: AlbumPhoto; readonly small: readonly AlbumPhoto[] }
  | { readonly kind: 'wide'; readonly wide: AlbumPhoto; readonly small: AlbumPhoto }
  | { readonly kind: 'even'; readonly photos: readonly AlbumPhoto[] };

export interface PersonSection {
  readonly person: AlbumPerson;
  readonly photos: readonly AlbumPhoto[];
}

function takenOrder(photo: AlbumPhoto): string {
  return photo.takenAt ?? photo.createdAt;
}

/** Oldest first, so a section reads the day in order and a new upload lands at its time. */
export function sortPhotos(photos: readonly AlbumPhoto[]): AlbumPhoto[] {
  return [...photos].sort(
    (a, b) => takenOrder(a).localeCompare(takenOrder(b)) || a.id.localeCompare(b.id),
  );
}

export function segmentPhotos(
  photos: readonly AlbumPhoto[],
  segment: AlbumSegment,
): readonly AlbumPhoto[] {
  return segment === 'best' ? photos.filter((photo) => photo.isPick) : photos;
}

/** Day sections in date order; photos without a day go last in one section of their own. */
export function daySections(photos: readonly AlbumPhoto[], days: readonly PlanDay[]): DaySection[] {
  const byDate = new Map<string, AlbumPhoto[]>();
  const undated: AlbumPhoto[] = [];
  for (const photo of sortPhotos(photos)) {
    if (photo.localDate === null) {
      undated.push(photo);
      continue;
    }
    const list = byDate.get(photo.localDate) ?? [];
    list.push(photo);
    byDate.set(photo.localDate, list);
  }
  const planDay = new Map(days.map((day) => [day.date, day]));
  const sections: DaySection[] = [...byDate.keys()].sort().map((date) => {
    const day = planDay.get(date);
    return {
      key: date,
      date,
      dayNo: day?.dayNo ?? null,
      theme: day?.theme ?? null,
      photos: byDate.get(date) ?? [],
    };
  });
  if (undated.length > 0) {
    sections.push({ key: 'undated', date: null, dayNo: null, theme: null, photos: undated });
  }
  return sections;
}

/**
 * A section's rows: a feature row (one large, two small) then a wide row (one wide, one small),
 * repeating; a remainder too short for the next pattern sits in an even row of up to three.
 * Picks lead a row where they can, so the guide's keepers get the large tiles.
 */
export function masonryRows(photos: readonly AlbumPhoto[]): MasonryRow[] {
  const rows: MasonryRow[] = [];
  let index = 0;
  let feature = true;
  while (index < photos.length) {
    const left = photos.length - index;
    if (feature && left >= 3) {
      const [a, b, c] = photos.slice(index, index + 3) as [AlbumPhoto, AlbumPhoto, AlbumPhoto];
      const lead = [a, b, c].find((photo) => photo.isPick) ?? a;
      rows.push({ kind: 'feature', large: lead, small: [a, b, c].filter((p) => p !== lead) });
      index += 3;
    } else if (!feature && left >= 2) {
      const [a, b] = photos.slice(index, index + 2) as [AlbumPhoto, AlbumPhoto];
      const lead = !a.isPick && b.isPick ? b : a;
      rows.push({ kind: 'wide', wide: lead, small: lead === a ? b : a });
      index += 2;
    } else {
      rows.push({ kind: 'even', photos: photos.slice(index, index + 3) });
      index += 3;
    }
    feature = !feature;
  }
  return rows;
}

/**
 * By person: each traveller with the photos they are in (tagged by themselves, by hand or by the
 * on-device match), in crew order; a traveller in none is left out.
 */
export function personSections(
  photos: readonly AlbumPhoto[],
  people: readonly AlbumPerson[],
  tags: readonly { readonly photoId: string; readonly userId: string }[],
): PersonSection[] {
  const byId = new Map(photos.map((photo) => [photo.id, photo]));
  return people
    .map((person) => ({
      person,
      photos: sortPhotos(
        tags
          .filter((tag) => tag.userId === person.id)
          .map((tag) => byId.get(tag.photoId))
          .filter((photo): photo is AlbumPhoto => photo !== undefined),
      ),
    }))
    .filter((section) => section.photos.length > 0);
}

export interface UploadSummary {
  /** Photos of this person still on the way up (on this device). */
  readonly uploading: number;
  readonly failed: number;
}
