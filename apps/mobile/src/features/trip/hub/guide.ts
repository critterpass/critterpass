/**
 * The trip's guide as the trip day shows it: its id (Tokek by default), its name, its card tone
 * and its colour (the destination wordmark, the alarm tint).
 */
import { tokens } from '@cp/design-tokens';

import { GUIDE_STICKERS } from '@/ui/avatar/guides';
import type { CardTone } from '@/ui/cards/tone';
import type { GuideId } from '@/ui/people/GuideLine';

const GUIDE_TONES: Readonly<Record<GuideId, CardTone>> = {
  tokek: 'yellow',
  pon: 'orange',
  lundi: 'blue',
  ajo: 'pink',
  sardi: 'green',
  paco: 'cream',
};

export function guideOr(value: string | null | undefined): GuideId {
  return value !== null && value !== undefined && value in GUIDE_TONES
    ? (value as GuideId)
    : 'tokek';
}

export function guideTone(guide: GuideId): CardTone {
  return GUIDE_TONES[guide];
}

export function guideColour(guide: GuideId): string {
  return tokens.guide[guide];
}

export function guideName(guide: GuideId, stored: string | null | undefined): string {
  return stored ?? GUIDE_STICKERS[guide].name;
}
