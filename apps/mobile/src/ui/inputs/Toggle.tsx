import { t } from '@lingui/core/macro';
import { useEffect } from 'react';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { tokens } from '@cp/design-tokens';

import { bezierEasing } from '@/motion/easing';
import { useReducedImpactMotion } from '@/motion/patterns/shared';

import { PressScale } from '../press/PressScale';
import { makeStyles, sizeToken, useTheme } from '../theme';

export interface ToggleProps {
  readonly value: boolean;
  readonly onValueChange: (next: boolean) => void;
  /** What the switch controls ("Talk out loud"); the row title usually. */
  readonly label: string;
  readonly disabled?: boolean;
  /** The `snap` a flip fires; off for a host that answers with its own cue. @default true */
  readonly feedback?: boolean;
  readonly testID?: string;
}

const { duration, easing } = tokens.motion;
const standard = bezierEasing(easing.standard);

const useStyles = makeStyles((t) => {
  const width = sizeToken(t.size.toggle, 'width');
  const height = sizeToken(t.size.toggle, 'height');
  const knob = sizeToken(t.size.toggle, 'knob');
  return {
    target: { justifyContent: 'center', alignItems: 'center' },
    track: {
      width,
      height,
      borderRadius: height / 2,
      borderWidth: 2,
      justifyContent: 'center',
      paddingHorizontal: (height - knob) / 2 - 2,
    },
    knob: {
      width: knob,
      height: knob,
      borderRadius: knob / 2,
      backgroundColor: t.color.paper.base,
    },
    travel: { width: width - height },
  };
});

/** On/off switch with a squash-and-stretch knob; announces "On"/"Off" as its value. */
export function Toggle({
  value,
  onValueChange,
  label,
  disabled = false,
  feedback = true,
  testID,
}: ToggleProps) {
  const styles = useStyles();
  const theme = useTheme();
  const reduced = useReducedImpactMotion();
  const position = useSharedValue(value ? 1 : 0);
  const squash = useSharedValue(1);
  const travel = styles.travel.width;

  useEffect(() => {
    position.value = withTiming(value ? 1 : 0, {
      duration: reduced ? 0 : duration.fast,
      easing: standard,
    });
    if (!reduced) {
      squash.value = withSequence(
        withTiming(1.14, { duration: duration.instant / 2 }),
        withTiming(1, { duration: duration.instant }),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- shared values are stable refs.
  }, [value, reduced]);

  const knobStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: position.value * travel },
      { scaleX: squash.value },
      { scaleY: 2 - squash.value },
    ],
  }));

  const on = value;
  return (
    <PressScale
      testID={testID}
      onPress={() => onValueChange(!value)}
      feedback={feedback ? 'snap' : undefined}
      disabled={disabled}
      widthClass="narrow"
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: on }}
      accessibilityValue={{
        text: on
          ? t({ id: 'common.toggle.on', message: 'On' })
          : t({ id: 'common.toggle.off', message: 'Off' }),
      }}
      style={styles.target}
    >
      <Animated.View
        style={[
          styles.track,
          {
            backgroundColor: on ? theme.semantic.state.success : theme.semantic.bg.control,
            borderColor: on ? theme.semantic.state.success : theme.semantic.border.control,
            opacity: disabled ? 0.4 : 1,
          },
        ]}
      >
        <Animated.View style={[styles.knob, knobStyle]} />
      </Animated.View>
    </PressScale>
  );
}
