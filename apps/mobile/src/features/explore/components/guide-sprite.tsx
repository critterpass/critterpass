/**
 * The destination's guide beside the you-dot on the map. The map draws an annotation from a
 * picture of its view, so the guide stands still there.
 */
import { Sticker } from '@/ui/sticker/Sticker';

import type { GuideFacts } from '../format';

const SPRITE = 40;

export function GuideSprite({ guide }: { readonly guide: GuideFacts }) {
  return <Sticker kind={guide.kind} name={guide.name} size={SPRITE} />;
}
