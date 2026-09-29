import { t } from '@lingui/core/macro';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { tokens } from '@cp/design-tokens';

import { impact } from '@/motion/feedback';
import { useReducedImpactMotion } from '@/motion/patterns/shared';

import { PillButton } from '../buttons/PillButton';
import { SecondaryText } from '../cards/SecondaryText';
import { Icon } from '../icons/Icon';
import { Row } from '../layout/Row';
import { Stack } from '../layout/Stack';
import { PressScale } from '../press/PressScale';
import { Text } from '../text/Text';
import { makeStyles, useTheme } from '../theme';

export interface ErrorFact {
  readonly key: string;
  /** What worked (✓) or what did not (✕), in plain words. */
  readonly ok: boolean;
  readonly text: string;
}

export interface ErrorAlternative {
  readonly key: string;
  readonly title: string;
  readonly body?: string;
  readonly onPress: () => void;
}

export interface ErrorSheetProps {
  /** Guide or context line ("Tokek got half of it"). */
  readonly eyebrow?: string;
  readonly title: string;
  readonly facts?: readonly ErrorFact[];
  /** Way forward 1: try again, or carry on with what worked. */
  readonly primary: { readonly label: string; readonly onPress: () => void };
  /** Way forward 2: other paths to the same goal (type it in, retake, pick another). */
  readonly alternatives?: readonly ErrorAlternative[];
  /** Way forward 3: step back out. */
  readonly onBack: () => void;
  readonly backLabel?: string;
  /** User-caused errors shake once with the error cue; system errors stay still. */
  readonly userCaused?: boolean;
  readonly testID?: string;
}

const { duration } = tokens.motion;
const SHAKE_PT = 8;

const useStyles = makeStyles((t) => ({
  tile: {
    flex: 1,
    minWidth: 0,
    backgroundColor: t.semantic.bg.raised,
    borderRadius: t.radius.md,
    padding: t.space['12'],
    gap: t.space['4'],
  },
  mark: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));

/**
 * The "three ways forward" error body (3i-4) for a `Sheet`: what worked and what did not, the
 * primary way on, alternative paths, and a way back. Never an error code, never a dead end.
 */
export function ErrorSheet({
  eyebrow,
  title,
  facts = [],
  primary,
  alternatives = [],
  onBack,
  backLabel,
  userCaused = false,
  testID,
}: ErrorSheetProps) {
  const styles = useStyles();
  const theme = useTheme();
  const reduced = useReducedImpactMotion();
  const shake = useSharedValue(0);

  useEffect(() => {
    if (!userCaused) return;
    impact('error');
    if (reduced) return;
    const step = { duration: duration.instant / 3 };
    shake.value = withSequence(
      withTiming(-SHAKE_PT, step),
      withTiming(SHAKE_PT, step),
      withTiming(0, step),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per shown error.
  }, []);

  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));

  return (
    <Animated.View style={shakeStyle} testID={testID}>
      <Stack gap="16">
        <Stack gap="8">
          {eyebrow ? (
            <Text variant="eyebrow" color={theme.semantic.action.primary}>
              {eyebrow}
            </Text>
          ) : null}
          <Text variant="h1" accessibilityRole="header">
            {title}
          </Text>
        </Stack>
        {facts.length > 0 ? (
          <Stack gap="8">
            {facts.map((fact) => (
              <Row key={fact.key} gap="10" align="center" accessible accessibilityLabel={fact.text}>
                <View
                  style={[
                    styles.mark,
                    {
                      backgroundColor: fact.ok
                        ? theme.semantic.state.success
                        : theme.semantic.state.urgent,
                    },
                  ]}
                >
                  {fact.ok ? (
                    <Icon name="check" size={12} color={theme.semantic.text.onAccent} decorative />
                  ) : (
                    <Text variant="label" color={theme.semantic.text.onAccent}>
                      ✕
                    </Text>
                  )}
                </View>
                <Text variant="body" style={{ flexShrink: 1 }}>
                  {fact.text}
                </Text>
              </Row>
            ))}
          </Stack>
        ) : null}
        {alternatives.length > 0 ? (
          <Row gap="10">
            {alternatives.map((alternative) => (
              <PressScale
                key={alternative.key}
                onPress={alternative.onPress}
                accessibilityLabel={
                  alternative.body ? `${alternative.title}, ${alternative.body}` : alternative.title
                }
                style={styles.tile}
              >
                <Text variant="title">{alternative.title}</Text>
                {alternative.body ? <SecondaryText>{alternative.body}</SecondaryText> : null}
              </PressScale>
            ))}
          </Row>
        ) : null}
        <PillButton label={primary.label} onPress={primary.onPress} />
        <PillButton
          variant="tertiary"
          label={backLabel ?? t({ id: 'common.error.back', message: 'Go back' })}
          onPress={onBack}
          block
        />
      </Stack>
    </Animated.View>
  );
}
