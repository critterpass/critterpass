/** The guide's sticker beside its notes on the plan screens (7a-1, 7a-3, 7b-1, 7b-3). */
import { GUIDE_STICKERS } from '@/ui/avatar/guides';
import type { GuideId } from '@/ui/people/GuideLine';
import { Sticker } from '@/ui/sticker/Sticker';

export function GuideSticker({
  guide,
  size = 34,
}: {
  readonly guide: GuideId;
  readonly size?: number;
}) {
  const sticker = GUIDE_STICKERS[guide];
  return <Sticker kind={sticker.kind} name={sticker.name} size={size} />;
}
