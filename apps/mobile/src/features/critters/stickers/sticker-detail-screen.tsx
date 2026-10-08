/**
 * The `(modal)` route's screen for a shelf sticker: the sticker by id from synced rows, in the
 * app's bottom sheet over the PASS tab. The route is a see-through card, so it always draws a
 * sheet: a placeholder while the rows load, and "not here" for an id this phone does not have.
 */
import { useLingui } from '@lingui/react/macro';
import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { Stack } from '@/ui/layout/Stack';
import { Sheet } from '@/ui/sheet/Sheet';
import { Skeleton } from '@/ui/states/Skeleton';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { StickerDetailSheet } from './StickerDetailSheet';
import { useStickers } from './use-stickers';

const useStyles = makeStyles((th) => ({
  body: { padding: th.space['20'], gap: th.space['16'] },
  center: { textAlign: 'center' },
}));

export function StickerDetailScreen() {
  const { stickerId } = useLocalSearchParams<{ stickerId: string }>();
  const { items, loaded } = useStickers();
  const styles = useStyles();
  const theme = useTheme();
  const { t } = useLingui();
  const item = items.find((candidate) => candidate.id === stickerId);
  if (item !== undefined) return <StickerDetailSheet item={item} />;
  const title = t({ id: 'stickers.detail.missingTitle', message: 'This sticker isn’t here' });
  return (
    <Sheet
      detents={['fit']}
      accessibilityLabel={title}
      testID={loaded ? 'sticker-detail-missing' : 'sticker-detail-loading'}
    >
      <View style={styles.body}>
        {loaded ? (
          <Stack gap="6" align="center">
            <Text variant="h2" accessibilityRole="header" style={styles.center}>
              {title}
            </Text>
            <Text variant="body" color={theme.semantic.text.secondary} style={styles.center}>
              {t({
                id: 'stickers.detail.missingLine',
                message: 'It may have been removed, or this phone hasn’t got it yet.',
              })}
            </Text>
          </Stack>
        ) : (
          <Skeleton preset="card" />
        )}
      </View>
    </Sheet>
  );
}
