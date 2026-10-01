/**
 * A shelf sticker up close (undesigned; built from the sheet and the settle screen's sticker): the
 * sticker, its name, how it was earned, and the date and trip.
 */
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import { Stack } from '@/ui/layout/Stack';
import { Sheet } from '@/ui/sheet/Sheet';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { StickerArt } from './sticker-art';
import { stickerHow, stickerName } from './sticker-copy';
import type { ShelfItem } from './sticker-model';

const useStyles = makeStyles((th) => ({
  body: { padding: th.space['20'], gap: th.space['16'], alignItems: 'center' },
  center: { textAlign: 'center' },
}));

export function StickerDetailSheet({
  item,
  onClose,
}: {
  readonly item: ShelfItem;
  /** Defaults to going back: the sheet is a `(modal)` route. */
  readonly onClose?: () => void;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const { t, i18n } = useLingui();
  const name = stickerName(i18n, item);
  const date = new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(item.grantedAt));
  const where =
    item.place === ''
      ? date
      : t({ id: 'stickers.detail.when', message: `${item.place} · ${date}` });
  return (
    <Sheet
      detents={['fit']}
      {...(onClose === undefined ? {} : { onDismiss: onClose })}
      accessibilityLabel={name}
      testID="sticker-detail"
    >
      <View style={styles.body}>
        <StickerArt item={item} size={140} />
        <Stack gap="6" align="center">
          <Text variant="h2" accessibilityRole="header" style={styles.center}>
            {name}
          </Text>
          <Text variant="body" style={styles.center} testID="sticker-detail-how">
            {stickerHow(i18n, item)}
          </Text>
          <Text
            variant="monoData"
            color={theme.semantic.text.secondary}
            testID="sticker-detail-when"
          >
            {where}
          </Text>
        </Stack>
      </View>
    </Sheet>
  );
}
