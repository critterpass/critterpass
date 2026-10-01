/**
 * The sticker shelf on the PASS tab, outside the dex grid: the Settled Tokek of every trip the crew
 * squared up and each crew level's sticker, newest first; tap one for how it was earned (the
 * detail sheet, a `(modal)` route). Stickers never count in the dex and are never picked as an
 * avatar or icon.
 */
import { router } from 'expo-router';

import { StickerShelfView } from './sticker-shelf-view';
import { useStickers } from './use-stickers';

/** The shelf over synced rows; a sticker opens its detail sheet over the tab. */
export function StickerShelf() {
  const { items, loaded } = useStickers();
  if (!loaded) return null;
  return (
    <StickerShelfView
      items={items}
      onOpen={(item) =>
        // eslint-disable-next-line lingui/no-unlocalized-strings -- a route path, never copy.
        router.push({ pathname: '/(modal)/sticker/[stickerId]', params: { stickerId: item.id } })
      }
    />
  );
}
