import { t } from '@lingui/core/macro';
import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { tokens } from '@cp/design-tokens';

import { useReducedImpactMotion } from '@/motion/patterns/shared';

import { SecondaryText } from '../cards/SecondaryText';
import { TypingDots } from '../chat/TypingDots';
import { Row } from '../layout/Row';
import { Stack } from '../layout/Stack';
import { Text } from '../text/Text';
import { makeStyles, useTheme } from '../theme';

export type MustDoState = 'added' | 'checked' | 'flagged' | 'typing';

export interface MustDoRowProps {
  /** Owner's avatar. */
  readonly owner: ReactNode;
  readonly ownerName: string;
  /** Empty while the owner is still typing. */
  readonly title?: string;
  readonly detail?: string;
  /** `checked` fits the draft; `flagged` clashes (shakes once); `typing` is a dashed placeholder. */
  readonly state: MustDoState;
  /** Tag text for the state ("Entered", "Clashes with day 3"). */
  readonly tag?: string;
  readonly testID?: string;
}

const SHAKE_PT = 4;
const SHAKE_STEP_MS = tokens.motion.duration.instant / 2;

function useShake(active: boolean) {
  const x = useSharedValue(0);
  const reduced = useReducedImpactMotion();
  useEffect(() => {
    if (!active || reduced) return;
    x.value = withSequence(
      withTiming(SHAKE_PT, { duration: SHAKE_STEP_MS }),
      withTiming(-SHAKE_PT, { duration: SHAKE_STEP_MS }),
      withTiming(SHAKE_PT / 2, { duration: SHAKE_STEP_MS }),
      withTiming(0, { duration: SHAKE_STEP_MS }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- x is a stable shared value ref.
  }, [active, reduced]);
  return useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
}

const useStyles = makeStyles((th) => ({
  row: {
    backgroundColor: th.semantic.bg.raised,
    borderRadius: th.radius.lg,
    padding: th.space['12'],
  },
  typing: {
    backgroundColor: th.semantic.bg.base,
    borderWidth: th.space['2'],
    borderStyle: 'dashed',
    borderColor: th.semantic.border.decorative,
  },
  tag: {
    borderRadius: th.radius.sm,
    paddingHorizontal: th.space['8'],
    paddingVertical: th.space['4'],
  },
}));

/** A crew member's one must-do: owner, title, detail and a checked / flagged / typing state. */
export function MustDoRow({ owner, ownerName, title, detail, state, tag, testID }: MustDoRowProps) {
  const styles = useStyles();
  const theme = useTheme();
  const shake = useShake(state === 'flagged');
  const typingLabel = t({ id: 'common.plan.isTyping', message: `${ownerName} is typing` });
  const label =
    state === 'typing' ? typingLabel : [ownerName, title, detail, tag].filter(Boolean).join(', ');
  const tagColor = state === 'flagged' ? theme.semantic.state.urgent : theme.semantic.state.success;
  return (
    <Animated.View
      testID={testID}
      accessible
      accessibilityRole="text"
      accessibilityLabel={label}
      style={[styles.row, state === 'typing' ? styles.typing : null, shake]}
    >
      <Row gap="12" align="center">
        {owner}
        {state === 'typing' ? (
          <Row gap="8" align="center" flex={1}>
            <SecondaryText>{typingLabel}</SecondaryText>
            <TypingDots />
          </Row>
        ) : (
          <Stack gap="2" flex={1}>
            <Text variant="title">{title}</Text>
            {detail ? <SecondaryText>{detail}</SecondaryText> : null}
          </Stack>
        )}
        {tag && state !== 'typing' ? (
          <View style={[styles.tag, { backgroundColor: tagColor }]}>
            <Text variant="label" color={theme.semantic.text.onAccent}>
              {tag}
            </Text>
          </View>
        ) : null}
      </Row>
    </Animated.View>
  );
}
