/**
 * What the full-screen viewer shows and where it stands in a set: the items of one set (a place's
 * photos, a message's photos, one cover), the item it opens on, the counter, and the line of
 * caption and credit under an item. A credit is never dropped: an item that has one always shows it.
 */
import { pickBySize, type MediaView } from '@/lib/media/variants';

export interface LightboxItem {
  /** Stable within its set. */
  readonly key: string;
  readonly kind: 'image' | 'video';
  /** The file to show; null while its link is being fetched (the page waits, the set still pages). */
  readonly uri: string | null;
  /** A video's still, shown until it plays and wherever the phone has no player. */
  readonly poster?: string | undefined;
  readonly caption?: string | undefined;
  /** Who the photo is by, or where it is from. */
  readonly credit?: string | undefined;
}

/** The nearest valid position in a set of `count` (0 for an empty set). */
export function clampIndex(index: number, count: number): number {
  if (count <= 0 || !Number.isFinite(index)) return 0;
  return Math.min(Math.max(Math.round(index), 0), count - 1);
}

/** Where the viewer opens for the item tapped; an item no longer in the set opens the first. */
export function indexOfKey(items: readonly LightboxItem[], key: string): number {
  const index = items.findIndex((item) => item.key === key);
  return index === -1 ? 0 : index;
}

/** The page a horizontal offset rests on. */
export function pageAt(offsetX: number, pageWidth: number, count: number): number {
  if (pageWidth <= 0) return 0;
  return clampIndex(offsetX / pageWidth, count);
}

/** "3 / 12": the position counted from one. Nothing for a set of one. */
export function counterOf(
  index: number,
  count: number,
): { readonly position: number; readonly total: number } | null {
  if (count <= 1) return null;
  return { position: clampIndex(index, count) + 1, total: count };
}

/** The caption and credit as shown: trimmed, and absent rather than empty. */
export function linesOf(item: LightboxItem): {
  readonly caption: string | null;
  readonly credit: string | null;
} {
  const caption = item.caption?.trim() ?? '';
  const credit = item.credit?.trim() ?? '';
  return { caption: caption === '' ? null : caption, credit: credit === '' ? null : credit };
}

/** The site a photo was found on, as its credit (`https://www.example.com/a` → `example.com`). */
export function siteCredit(pageUrl: string): string | undefined {
  const match = /^https?:\/\/(?:www\.)?([^/?#]+)/i.exec(pageUrl.trim());
  return match?.[1]?.toLowerCase();
}

/**
 * A licensed asset as one item: its largest still that the screen needs (a copy saved on the phone
 * first), its loop as a video when it has one, and its credit whether or not the licence asks for it.
 */
export function mediaViewItem(
  media: MediaView,
  pixels: number,
  savedUri: (url: string) => string | null = () => null,
): LightboxItem | null {
  const still = pickBySize(media.images, pixels);
  const video = pickBySize(media.videos, pixels);
  const credit = media.credit.trim() === '' ? undefined : media.credit;
  if (video !== undefined) {
    return {
      key: media.id,
      kind: 'video',
      uri: savedUri(video.url) ?? video.url,
      poster: still === undefined ? undefined : (savedUri(still.url) ?? still.url),
      credit,
    };
  }
  if (still === undefined) return null;
  return { key: media.id, kind: 'image', uri: savedUri(still.url) ?? still.url, credit };
}

/** How far a zoomed picture may be dragged from the centre on one axis before its edge shows. */
export function panLimit(size: number, scale: number): number {
  'worklet';
  return scale <= 1 ? 0 : (size * (scale - 1)) / 2;
}
