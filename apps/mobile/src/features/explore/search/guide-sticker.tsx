/** The guide's small sticker beside its line (7d-2 note, 7d-3 tip, 7d-4 ASK). */
import { GUIDE_STICKERS } from '@/ui/avatar/guides';
import type { GuideId } from '@/ui/people/GuideLine';
import { Sticker } from '@/ui/sticker/Sticker';

export function GuideSticker({
  guide,
  size = 36,
}: {
  readonly guide: GuideId;
  readonly size?: number;
}) {
  const sticker = GUIDE_STICKERS[guide];
  return <Sticker kind={sticker.kind} name={sticker.name} pose="idle" size={size} />;
}
