/**
 * The trip's guide as the trip day shows it: its id (Tokek by default), its name, its card tone
 * and its colour (the destination wordmark, the alarm tint).
 */
import { guideColour, guideIdOr, guideSticker } from '@/ui/avatar/guides';
import { guideCardTone, type CardTone } from '@/ui/cards/tone';
import type { GuideId } from '@/ui/people/GuideLine';

export function guideOr(value: string | null | undefined): GuideId {
  return guideIdOr(value);
}

export function guideTone(guide: GuideId): CardTone {
  return guideCardTone(guide);
}

export { guideColour };

export function guideName(guide: GuideId, stored: string | null | undefined): string {
  return stored ?? guideSticker(guide).name;
}
