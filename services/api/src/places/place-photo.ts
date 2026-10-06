/**
 * The one photo a list row, a map card or a pick shows of a place whose photos live in its AI
 * profile: the profile's first photo, with the page it came from. Offered under the place page's
 * own rule: only from a ready profile, and never for a place with a reviewed note (its page shows
 * the note and the editors' media instead of the profile).
 */
import { z } from 'zod';

export interface PlacePhoto {
  readonly url: string;
  /** The page the photo was found on: its credit, as the place page cites it. */
  readonly sourcePage: string;
}

const photosSchema = z.array(z.object({ key: z.string().min(1), source_page: z.string() }));

/**
 * A place's stored profile photos where its page would show them, else NULL, as SQL over the
 * place (`poi`) and its profile row (`profile`, left-joined).
 */
export function shownProfilePhotosSql(poi = 'p', profile = 'pp'): string {
  return `(CASE WHEN ${profile}.status = 'ready' AND coalesce(${poi}.editorial->>'why_go', '') = ''
                THEN ${profile}.photos END)`;
}

/**
 * The first of `photos` (what `shownProfilePhotosSql` read) as an address on the media host
 * (`MEDIA_PUBLIC_BASE_URL` when none is given); null without photos or without a media host.
 */
export function firstProfilePhoto(photos: unknown, mediaBaseUrl?: string): PlacePhoto | null {
  const base = (mediaBaseUrl ?? process.env['MEDIA_PUBLIC_BASE_URL'])?.replace(/\/+$/u, '');
  if (base === undefined || base === '') return null;
  const parsed = photosSchema.safeParse(photos);
  const first = parsed.success ? parsed.data[0] : undefined;
  return first === undefined
    ? null
    : { url: `${base}/${first.key}`, sourcePage: first.source_page };
}
