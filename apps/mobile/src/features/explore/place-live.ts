/**
 * The live facts a place page asks Foursquare for (`/v1/places/{id}/live`): hours, price, rating,
 * photos, visitors' tips, phone and website. Foursquare's terms allow no caching, so the answer is
 * parsed here, held by the screen while it is open and never written anywhere; a missing field,
 * an unknown shape or `available: false` simply shows nothing. Our own synced hours and price win
 * over the live ones whenever we have them.
 */
import { knownHours } from '@cp/domain';

export interface LivePhoto {
  readonly url: string;
  readonly width: number;
  readonly height: number;
}

export interface LiveTip {
  readonly text: string;
  readonly createdAt: string;
}

export interface PlaceLive {
  readonly available: boolean;
  readonly openNow: boolean | null;
  readonly closedPermanently: boolean;
  /** The domain hours shape, unchecked until `knownHours` reads it. */
  readonly hours: unknown;
  /** 1–4. */
  readonly priceLevel: number | null;
  /** 0–10. */
  readonly rating: number | null;
  readonly photos: readonly LivePhoto[];
  readonly tips: readonly LiveTip[];
  readonly website: string | null;
  readonly phone: string | null;
  readonly attribution: { readonly name: string; readonly url: string } | null;
}

const MAX_PHOTOS = 5;
const MAX_TIPS = 3;

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function finite(value: unknown, min: number, max: number): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
    ? value
    : null;
}

function webUrl(value: unknown): string | null {
  const url = text(value);
  return url !== null && /^https?:\/\//i.test(url) ? url : null;
}

function photos(value: unknown): LivePhoto[] {
  if (!Array.isArray(value)) return [];
  const out: LivePhoto[] = [];
  for (const item of value) {
    const photo = record(item);
    const url = webUrl(photo?.url);
    const width = finite(photo?.width, 1, Number.MAX_SAFE_INTEGER);
    const height = finite(photo?.height, 1, Number.MAX_SAFE_INTEGER);
    if (url !== null && width !== null && height !== null) out.push({ url, width, height });
  }
  return out.slice(0, MAX_PHOTOS);
}

function tips(value: unknown): LiveTip[] {
  if (!Array.isArray(value)) return [];
  const out: LiveTip[] = [];
  for (const item of value) {
    const tip = record(item);
    const body = text(tip?.text);
    if (body !== null) out.push({ text: body, createdAt: text(tip?.createdAt) ?? '' });
  }
  return out.slice(0, MAX_TIPS);
}

function attribution(value: unknown): PlaceLive['attribution'] {
  const found = record(value);
  const name = text(found?.name);
  const url = webUrl(found?.url);
  return name === null || url === null ? null : { name, url };
}

/** Reads the live answer leniently: only a body that is not an object fails. */
export function parsePlaceLive(body: unknown): PlaceLive | null {
  const wire = record(body);
  if (wire === null) return null;
  return {
    available: wire.available === true,
    openNow: typeof wire.openNow === 'boolean' ? wire.openNow : null,
    closedPermanently: wire.closedPermanently === true,
    hours: knownHours(wire.hours) === null ? null : wire.hours,
    priceLevel: finite(wire.priceLevel, 1, 4),
    rating: finite(wire.rating, 0, 10),
    photos: photos(wire.photos),
    tips: tips(wire.tips),
    website: webUrl(wire.website),
    phone: text(wire.phone),
    attribution: attribution(wire.attribution),
  };
}

/** The `safeParse` contract the travel-data reader expects. */
export const placeLiveParser = {
  safeParse(value: unknown): { success: true; data: PlaceLive } | { success: false } {
    const data = parsePlaceLive(value);
    return data === null ? { success: false } : { success: true, data };
  },
};

/** What the page shows from the live answer; every block is absent when it has nothing. */
export interface LiveDetails {
  readonly rating: number | null;
  /** Photos past the one in the hero. */
  readonly photos: readonly LivePhoto[];
  readonly tips: readonly LiveTip[];
  readonly phone: string | null;
  readonly website: string | null;
  /** Set whenever any live fact shows on the page, the hero and meta line included. */
  readonly attribution: { readonly name: string; readonly url: string } | null;
}

export interface LiveFacts {
  /** The hours the page reads: ours when we know them, else the live ones. */
  readonly hours: unknown;
  /** Live open-now, for when no hours are known at all. */
  readonly openNow: boolean | null;
  readonly closedPermanently: boolean;
  readonly priceLevel: number | null;
  /** The live hero when the place has no photo of its own. */
  readonly heroUrl: string | null;
  readonly details: LiveDetails | null;
}

// eslint-disable-next-line lingui/no-unlocalized-strings -- the data source's name and page, never copy.
const FOURSQUARE = { name: 'Foursquare', url: 'https://foursquare.com' };

export function liveFacts(
  live: PlaceLive | null | undefined,
  own: { readonly hours: unknown; readonly priceLevel: number | null; readonly hasPhoto: boolean },
): LiveFacts {
  const ownHours = knownHours(own.hours) === null ? null : own.hours;
  if (live === null || live === undefined || !live.available) {
    return {
      hours: ownHours,
      openNow: null,
      closedPermanently: false,
      priceLevel: own.priceLevel,
      heroUrl: null,
      details: null,
    };
  }
  const usesHours = ownHours === null && live.hours !== null;
  const usesOpenNow = ownHours === null && live.hours === null && live.openNow !== null;
  const usesPrice = own.priceLevel === null && live.priceLevel !== null;
  const hero = own.hasPhoto ? null : (live.photos[0] ?? null);
  // The strip never repeats the hero: it starts after a live hero, and skips its address.
  const strip = (hero === null ? live.photos : live.photos.slice(1)).filter(
    (photo, index, all) =>
      photo.url !== hero?.url && all.findIndex((other) => other.url === photo.url) === index,
  );
  const shown =
    usesHours ||
    usesOpenNow ||
    usesPrice ||
    live.closedPermanently ||
    hero !== null ||
    live.rating !== null ||
    strip.length > 0 ||
    live.tips.length > 0 ||
    live.phone !== null ||
    live.website !== null;
  return {
    hours: usesHours ? live.hours : ownHours,
    openNow: usesOpenNow ? live.openNow : null,
    closedPermanently: live.closedPermanently,
    priceLevel: usesPrice ? live.priceLevel : own.priceLevel,
    heroUrl: hero?.url ?? null,
    details: shown
      ? {
          rating: live.rating,
          photos: strip,
          tips: live.tips,
          phone: live.phone,
          website: live.website,
          attribution: live.attribution ?? FOURSQUARE,
        }
      : null,
  };
}
