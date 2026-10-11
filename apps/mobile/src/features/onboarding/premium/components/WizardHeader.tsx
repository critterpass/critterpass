/**
 * The pass wizard's header (2.05, 2.07, 2.09): the glass back circle, n slim segments that fill
 * with the Snappy spring as the steps go by, and the muted "n of N" count. Drawn on the ground (no
 * white bar), 60 from the top under the status bar.
 */
import { t } from '@lingui/core/macro';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  GlassIconButton,
  REDUCED_FADE_MS,
  SPRINGS,
  Text,
  usePremiumReducedMotion,
  usePremiumTheme,
} from '@/ui/premium';

export interface WizardHeaderProps {
  readonly current?: number;
  readonly total?: number;
  /** A word in place of the progress ("Last step"). */
  readonly label?: string;
  readonly onBack?: () => void;
  readonly backLabel: string;
  readonly testID?: string;
}

function Segment({ done }: { readonly done: boolean }) {
  const theme = usePremiumTheme();
  const reduced = usePremiumReducedMotion();
  const fill = useSharedValue(done ? 1 : 0);
  useEffect(() => {
    fill.value = reduced
      ? withTiming(done ? 1 : 0, { duration: REDUCED_FADE_MS })
      : withSpring(done ? 1 : 0, SPRINGS.snappy);
  }, [done, reduced, fill]);
  const style = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }));
  return (
    <View
      style={{
        flex: 1,
        height: theme.size.progressStep,
        borderRadius: theme.radius.progressStep,
        backgroundColor: theme.color.progressTodo,
        overflow: 'hidden',
      }}
    >
      <Animated.View style={[{ height: '100%', backgroundColor: theme.color.ink }, style]} />
    </View>
  );
}

export function WizardHeader({
  current = 0,
  total = 0,
  label,
  onBack,
  backLabel,
  testID,
}: WizardHeaderProps) {
  const theme = usePremiumTheme();
  const insets = useSafeAreaInsets();
  const step = String(current);
  const all = String(total);
  const count = t({ id: 'common.progress.stepOf', message: `${step} of ${all}` });
  return (
    <View
      testID={testID}
      style={{
        paddingTop: insets.top + theme.space.gap6,
        paddingHorizontal: theme.space.gutter,
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.space.gap14,
      }}
    >
      {onBack === undefined ? null : (
        <GlassIconButton icon="back" label={backLabel} onPress={onBack} testID="wizard-back" />
      )}
      {label !== undefined ? (
        <Text variant="rowTextStrong" tone="muted" style={{ flex: 1 }}>
          {label}
        </Text>
      ) : (
        <>
          <View
            accessible
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 0, max: total, now: current, text: count }}
            style={{ flex: 1, flexDirection: 'row', gap: theme.space.gap4 }}
          >
            {Array.from({ length: total }, (_, i) => (
              <Segment key={i} done={i < current} />
            ))}
          </View>
          <Text variant="rowTextStrong" tone="muted">
            {count}
          </Text>
        </>
      )}
    </View>
  );
}
