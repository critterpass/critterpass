import * as Haptics from 'expo-haptics';
import { useEffect } from 'react';
import { Pressable } from 'react-native';
import Animated, {
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { hitSlopFor } from '../motion/PressableScale';
import { usePremiumReducedMotion } from '../motion/reduced-motion';
import { SPRINGS } from '../motion/springs';
import { usePremiumTheme } from '../theme/PremiumThemeProvider';

export interface ToggleProps {
  readonly value: boolean;
  readonly onChange: (next: boolean) => void;
  /** The setting it switches ("Share with the Bali Six"). */
  readonly accessibilityLabel: string;
  readonly disabled?: boolean;
  readonly testID?: string;
}

/** The 52×32 switch (system green on, grey off); the knob slides on the Snappy spring. */
export function Toggle({ value, onChange, accessibilityLabel, disabled, testID }: ToggleProps) {
  const t = usePremiumTheme();
  const reduced = usePremiumReducedMotion();
  const on = useSharedValue(value ? 1 : 0);

  useEffect(() => {
    on.set(reduced ? (value ? 1 : 0) : withSpring(value ? 1 : 0, SPRINGS.snappy));
  }, [value, reduced, on]);

  const travel = t.size.toggleWidth - t.size.toggleKnob - t.space.toggleKnobInset * 2;
  const offColor = t.color.toggleOff;
  const onColor = t.color.toggleOn;
  const track = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(on.value, [0, 1], [offColor, onColor]),
  }));
  const knob = useAnimatedStyle(() => ({
    transform: [{ translateX: interpolate(on.value, [0, 1], [0, travel]) }],
  }));

  return (
    <Pressable
      testID={testID}
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value, disabled: disabled === true }}
      disabled={disabled}
      hitSlop={hitSlopFor(t.size.toggleWidth, t.size.toggleHeight)}
      onPress={() => {
        void Haptics.selectionAsync();
        onChange(!value);
      }}
      style={{ opacity: disabled === true ? t.opacity.disabled : 1 }}
    >
      <Animated.View
        style={[
          {
            width: t.size.toggleWidth,
            height: t.size.toggleHeight,
            borderRadius: t.radius.toggle,
            padding: t.space.toggleKnobInset,
          },
          track,
        ]}
      >
        <Animated.View
          style={[
            {
              width: t.size.toggleKnob,
              height: t.size.toggleKnob,
              borderRadius: t.size.toggleKnob / 2,
              backgroundColor: t.color.toggleKnob,
              boxShadow: t.shadow.toggleKnob,
            },
            knob,
          ]}
        />
      </Animated.View>
    </Pressable>
  );
}
