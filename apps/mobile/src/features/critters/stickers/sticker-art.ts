/** A shelf sticker's art: the guide of the sticker's trip (the Settled Tokek for the home set). */
import { guideSticker } from '@/ui/premium/stickers/guides';

export function guideArt(slug: string): { readonly kind: string; readonly name: string } {
  return guideSticker(slug);
}
