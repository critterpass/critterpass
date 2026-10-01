/**
 * Which file of an asset a slot loads: the smallest still at least as wide as the slot in device
 * pixels (the largest when none is), the smallest loop likewise, and a video's poster still.
 */
/** One still of an editorial asset: a WebP at a width. */
export interface MediaImage {
  readonly url: string;
  readonly w: number;
  readonly h: number;
}

/** One loop of an editorial video: an mp4 at a width. */
export interface MediaVideo extends MediaImage {
  readonly bytes: number;
}

/**
 * What a hero needs of an editorial asset (the `/v1/media` item): its files, placeholder and
 * credit.
 */
export interface MediaView {
  readonly id: string;
  readonly kind: 'photo' | 'video';
  readonly blurhash: string;
  readonly images: readonly MediaImage[];
  readonly videos: readonly MediaVideo[];
  readonly credit: string;
  readonly attribution_required: boolean;
}

export function pickBySize<T extends { readonly w: number }>(
  files: readonly T[],
  pixels: number,
): T | undefined {
  const sorted = [...files].sort((a, b) => a.w - b.w);
  return sorted.find((file) => file.w >= pixels) ?? sorted.at(-1);
}

/** The file name a variant is saved under on the device (`828.webp`). */
export function fileNameOf(url: string): string {
  return url.slice(url.lastIndexOf('/') + 1);
}
