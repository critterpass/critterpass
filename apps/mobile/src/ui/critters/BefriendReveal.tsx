import type { ReactNode } from 'react';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import { useSlap } from '@/motion/patterns/slap';

import { Row } from '../layout/Row';
import { Stack } from '../layout/Stack';
import { Tag } from '../plan/ActionPill';
import { SurfaceToneProvider } from '../surface/Scaffold';
import { Text } from '../text/Text';
import { Halftone } from '../textures/halftone';
import { Rays } from '../textures/rays';
import { makeStyles, useTheme } from '../theme';

export interface BefriendRevealProps {
  /** "Rare form · 2 of 4". */
  readonly eyebrow: string;
  /** "Befriended!". */
  readonly title: string;
  readonly critterName: string;
  readonly sticker: ReactNode;
  /** Reward chips ("+150 XP", "Temple Tokek", "2 in the crew"). */
  readonly chips?: readonly string[];
  /** "You stayed 11 minutes. It noticed." */
  readonly line?: string;
  /** Flood colour (the form colour). */
  readonly color?: string;
  readonly testID?: string;
}

const useStyles = makeStyles((th) => ({
  root: {
    alignItems: 'center',
    padding: th.space['24'],
    gap: th.space['14'],
    overflow: 'hidden',
    borderRadius: th.radius.cardBig,
  },
  art: {
    height: th.space['32'] * 6,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
}));

/** The befriend moment: colour flood, turning rays, the sticker slapping down and reward chips. */
export function BefriendReveal({
  eyebrow,
  title,
  critterName,
  sticker,
  chips = [],
  line,
  color,
  testID,
}: BefriendRevealProps) {
  const styles = useStyles();
  const theme = useTheme();
  const slap = useSlap({ active: true });
  return (
    <View
      testID={testID}
      style={[styles.root, { backgroundColor: color ?? theme.semantic.state.info }]}
    >
      <SurfaceToneProvider value="accent">
        <Halftone />
        <Stack
          gap="4"
          align="center"
          accessible
          accessibilityRole="header"
          accessibilityLabel={`${title} ${critterName}, ${eyebrow}`}
        >
          <Text variant="eyebrow">{eyebrow}</Text>
          <Text variant="displayXl" autoFit>
            {title}
          </Text>
        </Stack>
        <View style={styles.art} importantForAccessibility="no-hide-descendants">
          <Rays />
          <Animated.View style={slap}>{sticker}</Animated.View>
        </View>
        {chips.length > 0 ? (
          <Row
            gap="6"
            wrap
            justify="center"
            accessible
            accessibilityRole="text"
            accessibilityLabel={chips.join(', ')}
          >
            {chips.map((chip) => (
              <Tag
                key={chip}
                label={chip}
                color={theme.semantic.bg.base}
                textColor={theme.semantic.text.primary}
              />
            ))}
          </Row>
        ) : null}
        {line ? <Text variant="voice">{line}</Text> : null}
      </SurfaceToneProvider>
    </View>
  );
}
