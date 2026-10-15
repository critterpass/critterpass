import type { MediaAsset } from '@cp/domain';
import { PixelRatio } from 'react-native';

import { savedStillUri } from '@/lib/media/media-files';
import { pickBySize } from '@/lib/media/variants';

/**
 * The still a trip photo draws at `widthPt`: the copy saved on this phone when there is one (so it
 * shows with no signal), else the closest size's URL; null with no photo.
 */
export function heroStillUri(media: MediaAsset | null, widthPt: number): string | null {
  if (media === null) return null;
  const still = pickBySize(media.images, widthPt * PixelRatio.get());
  if (still === undefined) return null;
  return savedStillUri(media, still.url) ?? still.url;
}
