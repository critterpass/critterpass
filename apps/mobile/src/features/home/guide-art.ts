/**
 * Which critter draws a guide (kind, seed, name), for screens of either UI: the guide catalogue's
 * data, read through one place so premium views never reach into the current kit for it.
 */
import { guideSticker, type GuideStickerInfo } from '@/ui/avatar/guides';

import { guideOr } from './format';

export type { GuideStickerInfo };

/** The guide's sticker art; a slug nobody knows is the default guide (Tokek). */
export function guideArt(slug: string | null | undefined): GuideStickerInfo {
  return guideSticker(guideOr(slug));
}
