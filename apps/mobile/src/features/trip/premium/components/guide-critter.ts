/**
 * The critter a trip's guide is drawn as on premium notes (Tokek the gecko for a guest guide). The
 * dex mapping lives with the current kit's guide stickers; this is its one premium entry point.
 */
import { guideSticker } from '@/ui/avatar/guides';

export function guideCritterKind(guideId: string | null | undefined): string {
  return guideSticker(guideId).kind;
}

/** The guide's own name as its critter is called ("Tokek"). */
export function guideCritterName(guideId: string | null | undefined): string {
  return guideSticker(guideId).name;
}
