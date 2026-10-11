/**
 * One this-or-that card (2.07): a white-framed card tilted a little, the side's colour field with
 * its title and line, and Tokek in the side's pose hanging off a corner. Picked, it stays; the
 * other card flings away on the Lively spring (Reduce Motion fades it).
 */
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import type { Pose } from '@cp/critter-art';

import {
  CritterSticker,
  PressableScale,
  REDUCED_FADE_MS,
  SPRINGS,
  Text,
  usePremiumReducedMotion,
  usePremiumTheme,
} from '@/ui/premium';

import type { QuizSide } from '../../taste/use-taste-quiz';

export interface QuizPhotoCardProps {
  readonly side: QuizSide;
  readonly label: string;
  readonly line: string;
  readonly pose: Pose;
  readonly guide: { readonly name: string; readonly kind: string };
  readonly flung: boolean;
  readonly onPick: (side: QuizSide) => void;
}

export function QuizPhotoCard({
  side,
  label,
  line,
  pose,
  guide,
  flung,
  onPick,
}: QuizPhotoCardProps) {
  const theme = usePremiumTheme();
  const reduced = usePremiumReducedMotion();
  const away = useSharedValue(0);
  const left = side === 'left';
  useEffect(() => {
    if (!flung) {
      away.value = 0;
      return;
    }
    away.value = reduced
      ? withTiming(1, { duration: REDUCED_FADE_MS })
      : withSpring(1, SPRINGS.lively);
  }, [flung, reduced, away]);
  const style = useAnimatedStyle(() => {
    const direction = left ? -1 : 1;
    return reduced
      ? { opacity: 1 - away.value }
      : {
          transform: [
            { translateX: away.value * 460 * direction },
            { translateY: away.value * 40 },
            { rotate: `${String((left ? -1.5 : 1.2) + away.value * 20 * direction)}deg` },
          ],
        };
  });
  return (
    <Animated.View style={[{ zIndex: left ? 2 : 1 }, style]}>
      <PressableScale
        onPress={() => onPick(side)}
        accessibilityRole="button"
        accessibilityLabel={`${label}. ${line}`}
        testID={`quiz-card-${side}`}
      >
        <View
          style={{
            padding: theme.space.photoFrame,
            borderRadius: theme.radius.cardLarge,
            backgroundColor: theme.color.card,
            boxShadow: theme.shadow.card,
          }}
        >
          <View
            style={{
              height: left ? 218 : 200,
              borderRadius: theme.radius.cardLarge - theme.space.photoFrame,
              backgroundColor: left ? theme.accent.sun : theme.accent.sky,
              justifyContent: 'flex-end',
              alignItems: left ? 'flex-start' : 'flex-end',
              padding: 18,
            }}
          >
            <Text variant="largeTitle" tone="onAccent" align={left ? 'left' : 'right'}>
              {label}
            </Text>
            <Text variant="body" tone="onAccent" align={left ? 'left' : 'right'}>
              {line}
            </Text>
          </View>
        </View>
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            ...(left ? { right: -6, top: -34 } : { left: -8, bottom: -26 }),
          }}
        >
          <CritterSticker kind={guide.kind} name={guide.name} size={left ? 98 : 92} pose={pose} />
        </View>
      </PressableScale>
    </Animated.View>
  );
}
