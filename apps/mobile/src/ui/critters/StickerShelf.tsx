import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

import { Row } from '../layout/Row';
import { Stack } from '../layout/Stack';
import { PressScale } from '../press/PressScale';
import { Text } from '../text/Text';
import { makeStyles, useTheme } from '../theme';

export interface ShelfSticker {
  readonly id: string;
  readonly sticker: ReactNode;
  /** Spoken name ("Temple Tokek, rare form"); locked ones use the locked label. */
  readonly label: string;
  readonly onPress?: () => void;
}

export interface ShelfProps {
  /** "Stickers". */
  readonly title?: string;
  /** Trailing link text ("All 12 ›"). */
  readonly moreLabel?: string;
  readonly onMore?: () => void;
  readonly stickers: readonly ShelfSticker[];
  readonly testID?: string;
}

const useStyles = makeStyles((th) => ({
  shelf: {
    paddingBottom: th.space['8'],
    borderBottomWidth: th.space['4'],
    borderBottomColor: th.semantic.bg.control,
  },
  item: { alignItems: 'center', justifyContent: 'flex-end' },
}));

/** A scrolling shelf of collected stickers standing on a ledge. */
export function StickerShelf({ title, moreLabel, onMore, stickers, testID }: ShelfProps) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <Stack gap="8" testID={testID}>
      {title || moreLabel ? (
        <Row justify="space-between" align="center">
          {title ? <Text variant="eyebrow">{title}</Text> : <View />}
          {moreLabel && onMore ? (
            <PressScale
              accessibilityLabel={moreLabel}
              onPress={onMore}
              widthClass="narrow"
              style={{ justifyContent: 'center' }}
            >
              <Text variant="label" color={theme.semantic.action.primary}>
                {moreLabel}
              </Text>
            </PressScale>
          ) : null}
        </Row>
      ) : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <Row gap="12" align="flex-end" style={styles.shelf}>
          {stickers.map((item) =>
            item.onPress ? (
              <PressScale
                key={item.id}
                accessibilityLabel={item.label}
                onPress={item.onPress}
                widthClass="narrow"
                style={styles.item}
              >
                {item.sticker}
              </PressScale>
            ) : (
              <View
                key={item.id}
                style={styles.item}
                accessible
                accessibilityRole="image"
                accessibilityLabel={item.label}
              >
                {item.sticker}
              </View>
            ),
          )}
        </Row>
      </ScrollView>
    </Stack>
  );
}
