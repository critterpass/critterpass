import type { ReactNode } from 'react';
import { View } from 'react-native';

import type { Tier } from '../chips/TierLabel';
import { tierWord } from '../chips/TierLabel';
import { Text } from '../text/Text';
import { makeStyles, useTheme } from '../theme';

export interface CritterAvatarProps {
  /** The critter's sticker (`Sticker` / `LiveSticker`) sized to fit inside. */
  readonly sticker: ReactNode;
  readonly name: string;
  readonly tier: Tier;
  /** @default 56 */
  readonly size?: number;
  readonly testID?: string;
}

const useStyles = makeStyles((t) => ({
  ring: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.semantic.bg.raised,
  },
  glyph: {
    position: 'absolute',
    bottom: -t.space['2'],
    end: -t.space['2'],
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.semantic.bg.base,
  },
}));

/** A critter in a tier-coloured ring with its tier glyph badge (3n-1, 3n-4). */
export function CritterAvatar({ sticker, name, tier, size = 56, testID }: CritterAvatarProps) {
  const styles = useStyles();
  const theme = useTheme();
  const token = theme.tier[tier];
  const ringWidth = tier === 'common' ? 2 : 3;
  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="image"
      accessibilityLabel={`${name}, ${tierWord(tier)}`}
    >
      <View
        style={[
          styles.ring,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: ringWidth,
            borderColor: token.color,
          },
        ]}
      >
        {sticker}
      </View>
      <View style={styles.glyph}>
        <Text variant="label" color={token.color}>
          {token.glyph}
        </Text>
      </View>
    </View>
  );
}
