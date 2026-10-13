import { PremiumStickerDetailSheet } from '@/features/critters/premium/stickers/sticker-detail-sheet';
import { StickerDetailScreen } from '@/features/critters/stickers/sticker-detail-screen';
import { premiumRoute } from '@/lib/premium-ui';

/** A shelf sticker up close: how it was earned, when and on which trip (a fit sheet). */
export default premiumRoute({
  premium: PremiumStickerDetailSheet,
  legacy: StickerDetailScreen,
});
