import { t } from '@lingui/core/macro';
import { useEffect } from 'react';
import type { ReactNode } from 'react';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { tokens } from '@cp/design-tokens';

import { useReducedImpactMotion } from '@/motion/patterns/shared';

import { Row } from '../layout/Row';
import { Stack } from '../layout/Stack';
import { Text } from '../text/Text';
import { makeStyles } from '../theme';

export interface Reaction {
  readonly id: string;
  readonly author: string;
  readonly text: string;
  readonly avatar?: ReactNode;
}

export interface ReactionFloatsProps {
  /** Newest last. */
  readonly reactions: readonly Reaction[];
  /** Pills kept on screen. @default 3 */
  readonly max?: number;
  readonly testID?: string;
}

const RISE_PT = 24;

const useStyles = makeStyles((th) => ({
  pill: {
    alignItems: 'center',
    gap: th.space['6'],
    backgroundColor: th.color.paper.base,
    borderRadius: th.radius.xl,
    paddingStart: th.space['4'],
    paddingEnd: th.space['12'],
    paddingVertical: th.space['4'],
  },
}));

function FloatPill({ reaction }: { readonly reaction: Reaction }) {
  const styles = useStyles();
  const reduced = useReducedImpactMotion();
  const rise = useSharedValue(reduced ? 0 : RISE_PT);
  const opacity = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    const duration = tokens.motion.duration.medium;
    rise.value = withTiming(0, { duration });
    opacity.value = withTiming(1, { duration });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stable shared value refs; entrance runs once.
  }, []);
  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: rise.value }],
  }));
  return (
    <Animated.View style={style}>
      <Row style={styles.pill}>
        {reaction.avatar}
        <Text variant="label" color={tokens.color.paper.ink}>
          {reaction.text}
        </Text>
      </Row>
    </Animated.View>
  );
}

/** Live reactions rising up the side of a story; the newest few stay, older ones leave. */
export function ReactionFloats({ reactions, max = 3, testID }: ReactionFloatsProps) {
  const shown = reactions.slice(-max);
  const spoken = shown.map((reaction) => `${reaction.author}: ${reaction.text}`).join('; ');
  return (
    <Stack
      gap="6"
      align="flex-end"
      testID={testID}
      accessible={shown.length > 0}
      accessibilityRole="text"
      accessibilityLabel={
        shown.length > 0
          ? t({ id: 'common.chat.reactions', message: `Reactions: ${spoken}` })
          : undefined
      }
      accessibilityLiveRegion="polite"
    >
      {shown.map((reaction) => (
        <FloatPill key={reaction.id} reaction={reaction} />
      ))}
    </Stack>
  );
}
