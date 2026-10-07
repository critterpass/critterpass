/**
 * The recap's public link on the phone (`/rc/{token}`), read through the api and never synced.
 *
 * Sharing: the server keeps only the hash of a link's token, so the phone remembers the link it
 * made (per recap) and shares that one again while the server still lists it as live; otherwise it
 * makes a new one. Stopping switches off every live link the traveller may switch off.
 *
 * Landing: a link opened in the app is asked of the public read first (a link switched off must
 * stop opening anything), then of the travellers' own read, which answers only for someone who was
 * on the trip: they get their own recap, everyone else the public page.
 */
/* eslint-disable lingui/no-unlocalized-strings -- route paths and cache ids, never copy. */
import { publicRecapSchema, recapLinksSchema, type PublicRecap, type RecapLinks } from '@cp/domain';

import {
  createLastGoodCache,
  type LastGoodCache,
  type TravelDataReader,
} from '@/data/travel-data/client';

export function recapLinksPath(recapId: string): string {
  return `/v1/recaps/${encodeURIComponent(recapId)}/links`;
}

export function publicRecapPath(token: string): string {
  return `/v1/public/recap/${encodeURIComponent(token)}`;
}

/** The recap's live links as this traveller sees them; null when not theirs or out of reach. */
export async function readRecapLinks(
  reader: TravelDataReader | null,
  recapId: string,
  signal?: AbortSignal,
): Promise<RecapLinks | null> {
  if (reader === null) return null;
  try {
    const response = await reader.getJson(recapLinksPath(recapId), signal);
    if (response.status !== 200) return null;
    const parsed = recapLinksSchema.safeParse(response.body);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export interface RememberedLink {
  readonly linkId: string;
  readonly url: string;
}

export interface RememberedLinks {
  get(recapId: string): RememberedLink | null;
  set(recapId: string, link: RememberedLink): void;
  forget(recapId: string): void;
}

export function rememberedLinks(cache: LastGoodCache): RememberedLinks {
  return {
    get(recapId) {
      const body = cache.get(recapId)?.body as Partial<RememberedLink> | null | undefined;
      return typeof body?.linkId === 'string' && typeof body.url === 'string'
        ? { linkId: body.linkId, url: body.url }
        : null;
    },
    set: (recapId, link) => cache.set(recapId, link, new Date()),
    forget: (recapId) => cache.set(recapId, null, new Date()),
  };
}

let shared: RememberedLinks | undefined;
export function deviceRememberedLinks(): RememberedLinks {
  shared ??= rememberedLinks(createLastGoodCache('cp-recap-links', { max: 24 }));
  return shared;
}

/**
 * The remembered link, when the server still lists it as this traveller's live link. With no
 * answer from the server there is nothing to check it against, so it is not shared.
 */
export function reusableLink(
  remembered: RememberedLink | null,
  links: RecapLinks | null,
): RememberedLink | null {
  if (remembered === null || links === null) return null;
  return links.links.some((link) => link.link_id === remembered.linkId && link.mine)
    ? remembered
    : null;
}

/** How many live links "Stop sharing" would switch off for this traveller. */
export function stoppableLinks(links: RecapLinks | null): number {
  return links === null ? 0 : links.links.filter((link) => link.can_revoke).length;
}

export type RecapLinkLanding =
  | { readonly kind: 'loading' }
  /** The viewer travelled on this trip: their own recap. */
  | { readonly kind: 'mine'; readonly tripId: string }
  /** Anyone else: the public-safe recap. */
  | { readonly kind: 'public'; readonly recap: PublicRecap }
  /** Switched off, or never a recap link: nothing to open, and asking again will not help. */
  | { readonly kind: 'gone' }
  /** No answer (offline, the api is down): worth another try. */
  | { readonly kind: 'unreachable' };

export async function resolveRecapLink(
  reader: TravelDataReader | null,
  token: string,
  signal?: AbortSignal,
): Promise<RecapLinkLanding> {
  if (reader === null) return { kind: 'unreachable' };
  let response;
  try {
    response = await reader.getJson(publicRecapPath(token), signal);
  } catch {
    return { kind: 'unreachable' };
  }
  if (response.status === 404) return { kind: 'gone' };
  if (response.status < 200 || response.status >= 300) return { kind: 'unreachable' };
  const parsed = publicRecapSchema.safeParse(response.body);
  if (!parsed.success) return { kind: 'gone' };
  const own = await readRecapLinks(reader, parsed.data.recap_id, signal);
  return own === null
    ? { kind: 'public', recap: parsed.data }
    : { kind: 'mine', tripId: own.trip_id };
}
