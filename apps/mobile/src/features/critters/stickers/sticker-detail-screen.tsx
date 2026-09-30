/**
 * The `(modal)` route's screen for a shelf sticker: the sticker by id from synced rows, in the
 * app's bottom sheet over the PASS tab; nothing while it loads.
 */
import { useLocalSearchParams } from 'expo-router';

import { StickerDetailSheet } from './StickerDetailSheet';
import { useStickers } from './use-stickers';

export function StickerDetailScreen() {
  const { stickerId } = useLocalSearchParams<{ stickerId: string }>();
  const { items } = useStickers();
  const item = items.find((candidate) => candidate.id === stickerId);
  return item === undefined ? null : <StickerDetailSheet item={item} />;
}
