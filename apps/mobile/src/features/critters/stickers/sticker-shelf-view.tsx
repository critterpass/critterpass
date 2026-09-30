/**
 * The sticker shelf as a view: the eyebrow and the stickers standing on their ledge, or how to earn
 * one when there are none yet (undesigned).
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';

import { useLocale } from '@/lib/i18n/use-locale';
import { StickerShelf as Shelf } from '@/ui/critters/StickerShelf';
import { Stack } from '@/ui/layout/Stack';
import { Text } from '@/ui/text/Text';
import { useTheme } from '@/ui/theme';

import { StickerArt } from './sticker-art';
import { stickerName } from './sticker-copy';
import type { ShelfItem } from './sticker-model';

export function StickerShelfView({
  items,
  onOpen,
}: {
  readonly items: readonly ShelfItem[];
  readonly onOpen: (item: ShelfItem) => void;
}) {
  const theme = useTheme();
  const locale = useLocale();
  const { t, i18n } = useLingui();
  const title = upper(t({ id: 'stickers.shelf.title', message: 'Stickers' }), locale);
  return (
    <Stack gap="8" testID="sticker-shelf">
      {items.length === 0 ? (
        <Stack gap="4">
          <Text variant="eyebrow">{title}</Text>
          <Text variant="bodySm" color={theme.semantic.text.secondary} testID="sticker-shelf-empty">
            {t({
              id: 'stickers.shelf.empty',
              message: 'Settle a trip to the last payment or level up your crew to earn one.',
            })}
          </Text>
        </Stack>
      ) : (
        <Shelf
          title={title}
          stickers={items.map((item) => ({
            id: item.id,
            sticker: <StickerArt item={item} size={64} />,
            label: stickerName(i18n, item),
            onPress: () => onOpen(item),
          }))}
        />
      )}
    </Stack>
  );
}
