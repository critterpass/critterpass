/**
 * A place's photos as sets for the full-screen viewer, each keeping its credit: a photo the guide
 * found is credited to the site it is from, a Foursquare photo to Foursquare, and the place's own
 * licensed photo to its author.
 */
import type { MediaView } from '@/lib/media/variants';
import type { LightboxItem } from '@/ui/media/lightbox/lightbox-model';
import { mediaViewItem, siteCredit } from '@/ui/media/lightbox/lightbox-model';

import type { LiveDetails, LivePhoto } from './place-live';

export function profilePhotoItems(
  photos: readonly { readonly url: string; readonly sourcePage: string }[],
): LightboxItem[] {
  return photos.map((photo) => ({
    key: photo.url,
    kind: 'image',
    uri: photo.url,
    credit: siteCredit(photo.sourcePage),
  }));
}

export function livePhotoItems(
  photos: readonly LivePhoto[],
  attribution: LiveDetails['attribution'],
): LightboxItem[] {
  return photos.map((photo) => ({
    key: photo.url,
    kind: 'image',
    uri: photo.url,
    credit: attribution?.name,
  }));
}

/**
 * The photo at the top of the place's page as a set of one: the place's own licensed photo with
 * its credit, else the live or found photo standing in for it with the credit of where it is from.
 * A stock photo standing in for the place opens nothing (it is not a picture of the place).
 */
export function heroPhotoItems(hero: {
  readonly photo: MediaView | null;
  readonly generic: boolean;
  readonly heroUrl: string | null | undefined;
  readonly heroCredit: string | undefined;
  readonly pixels: number;
  readonly savedUri?: (url: string) => string | null;
}): LightboxItem[] {
  if (hero.photo !== null) {
    if (hero.generic) return [];
    const item = mediaViewItem(hero.photo, hero.pixels, hero.savedUri);
    // A place's page shows its photo as a still, so the viewer does too.
    return item === null || item.kind !== 'image' ? [] : [item];
  }
  if (!hero.heroUrl) return [];
  return [{ key: hero.heroUrl, kind: 'image', uri: hero.heroUrl, credit: hero.heroCredit }];
}

/** Where the standing-in hero photo is from: Foursquare's live one, else the first found photo's site. */
export function heroCreditOf(
  live: { readonly heroUrl: string | null; readonly details: LiveDetails | null },
  found: readonly { readonly sourcePage: string }[],
): string | undefined {
  if (live.heroUrl !== null) return live.details?.attribution?.name;
  const first = found[0];
  return first === undefined ? undefined : siteCredit(first.sourcePage);
}
