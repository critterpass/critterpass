import { LocalFirstGate } from '@/features/critters/local-first-gate';
import { StickerDetailScreen } from '@/features/critters/stickers/sticker-detail-screen';

/** A shelf sticker up close: how it was earned, when and on which trip (a fit sheet). */
export default function StickerRoute() {
  return (
    <LocalFirstGate>
      <StickerDetailScreen />
    </LocalFirstGate>
  );
}
