import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Stack } from '../layout/Stack';
import { SurfaceToneProvider } from '../surface/Scaffold';
import { Text } from '../text/Text';
import { Engraving } from '../textures/engraving';
import { makeStyles, useTheme } from '../theme';

export interface PassportCoverProps {
  /** Small running title at the top ("Critterpass"). */
  readonly title: string;
  /** The big cover word ("Passport", "Plus"). */
  readonly mark: string;
  /** Foot line ("Winston · 7 trips"). */
  readonly subtitle: string;
  /** The emblem: the holder's first guide sticker. */
  readonly emblem?: ReactNode;
  /** `gold` is the Pass+ cover (4a-3); `ink` the standard dark cover. @default 'ink' */
  readonly variant?: 'ink' | 'gold';
  readonly accessibilityLabel: string;
  readonly testID?: string;
}

const useStyles = makeStyles((t) => ({
  cover: {
    aspectRatio: 0.7,
    borderRadius: t.radius.lg,
    borderTopStartRadius: t.radius.xs,
    borderBottomStartRadius: t.radius.xs,
    padding: t.space['24'],
    overflow: 'hidden',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  emblem: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
}));

/** The passport's closed cover: engraved ink or Pass+ gold board, foil words, guide emblem. */
export function PassportCover({
  title,
  mark,
  subtitle,
  emblem,
  variant = 'ink',
  accessibilityLabel,
  testID,
}: PassportCoverProps) {
  const styles = useStyles();
  const theme = useTheme();
  const gold = variant === 'gold';
  const foil = gold ? theme.color.gold.silhouette : theme.color.gold.base;
  return (
    <View
      testID={testID}
      style={[
        styles.cover,
        { backgroundColor: gold ? theme.color.yellow : theme.semantic.bg.sunken },
      ]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
    >
      <SurfaceToneProvider value={gold ? 'accent' : 'dark'}>
        <Engraving />
        <Text variant="label" color={foil}>
          {title}
        </Text>
        <View style={[styles.emblem, { borderColor: foil }]}>{emblem}</View>
        <Stack align="center" gap="8">
          <Text variant="h1" color={foil}>
            {mark}
          </Text>
          <Text variant="monoData" color={foil} style={{ textAlign: 'center' }}>
            {subtitle}
          </Text>
        </Stack>
      </SurfaceToneProvider>
    </View>
  );
}
