/**
 * One this-or-that card (2.07): a paper-framed photo tilted a little (−1.5° top, 1.2° bottom), the
 * side's title and line in white over a shade at its foot, the pair's doodle in a corner (the top card's by its words, the bottom card's at the top) and Tokek
 * in the side's pose hanging off another. A pair with no photo shows the side's colour field under
 * the same words. Picked, it stays; the other card flings away on the Lively spring (Reduce Motion
 * fades it).
 */
import { useEffect, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import {
  CritterSticker,
  PressableScale,
  REDUCED_FADE_MS,
  SPRINGS,
  Text,
  usePremiumReducedMotion,
  usePremiumTheme,
} from '@/ui/premium';

import { cardArt } from '../../taste/card-art';
import { photoTop, quizPhoto } from '../../taste/quiz-photos';
import type { QuizSide } from '../../taste/use-taste-quiz';
import { PHOTO_INK, PHOTO_SHADE } from '../components/onboarding-colours';

export interface QuizPhotoCardProps {
  readonly questionId: string;
  readonly side: QuizSide;
  readonly label: string;
  readonly line: string;
  readonly guide: { readonly name: string; readonly kind: string };
  readonly flung: boolean;
  readonly onPick: (side: QuizSide) => void;
}

export function QuizPhotoCard({
  questionId,
  side,
  label,
  line,
  guide,
  flung,
  onPick,
}: QuizPhotoCardProps) {
  const theme = usePremiumTheme();
  const reduced = usePremiumReducedMotion();
  const away = useSharedValue(0);
  const left = side === 'left';
  const art = cardArt(questionId, side);
  const photo = quizPhoto(questionId, side);
  const [frame, setFrame] = useState({ width: 0, height: 0 });
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
    const tilt = left ? -1.5 : 1.2;
    return reduced
      ? { opacity: 1 - away.value, transform: [{ rotate: `${String(tilt)}deg` }] }
      : {
          transform: [
            { translateX: away.value * 460 * direction },
            { translateY: away.value * 40 },
            { rotate: `${String(tilt + away.value * 20 * direction)}deg` },
          ],
        };
  });
  const inner = theme.radius.cardLarge - theme.space.photoFrame;
  const align = left ? 'left' : 'right';
  const ink = photo === null ? undefined : PHOTO_INK;
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
            backgroundColor: theme.accent.paper,
            boxShadow: theme.shadow.card,
          }}
        >
          <View
            style={{
              minHeight: left ? 218 : 200,
              borderRadius: inner,
              overflow: 'hidden',
              // Under a photo the field is ink: a colour edge showed past the photo's antialiased
              // edge on the tilted card.
              backgroundColor:
                photo !== null
                  ? theme.color.inkSurface
                  : left
                    ? theme.accent.sun
                    : theme.accent.sky,
              justifyContent: 'flex-end',
              alignItems: left ? 'flex-start' : 'flex-end',
              padding: 18,
            }}
            onLayout={(event) => {
              const { width, height } = event.nativeEvent.layout;
              setFrame({ width, height });
            }}
          >
            {photo === null ? null : (
              <>
                <Image
                  source={photo.source}
                  resizeMode="cover"
                  style={
                    frame.width === 0
                      ? StyleSheet.absoluteFill
                      : {
                          position: 'absolute',
                          left: 0,
                          width: frame.width,
                          height: Math.max(frame.height, frame.width / photo.aspect),
                          top: photoTop(photo, frame),
                        }
                  }
                  accessibilityIgnoresInvertColors
                />
                <View
                  pointerEvents="none"
                  style={[StyleSheet.absoluteFill, { experimental_backgroundImage: PHOTO_SHADE }]}
                />
              </>
            )}
            <Text
              variant="largeTitle"
              {...(ink === undefined ? { tone: 'onAccent' as const } : { color: ink })}
              align={align}
            >
              {label}
            </Text>
            <Text
              variant="body"
              {...(ink === undefined ? { tone: 'onAccent' as const } : { color: ink })}
              align={align}
            >
              {line}
            </Text>
          </View>
        </View>
        {art.doodle === null ? null : (
          <View
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            // The top card's doodle sits by its words (bottom right); the bottom card's words sit
            // there, so its doodle takes the top right.
            style={{ position: 'absolute', right: 22, ...(left ? { bottom: 22 } : { top: 22 }) }}
          >
            <CritterSticker kind={art.doodle} name={label} size={40} />
          </View>
        )}
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            ...(left ? { right: -6, top: -34 } : { left: -8, bottom: -26 }),
          }}
        >
          <CritterSticker
            kind={guide.kind}
            name={guide.name}
            size={left ? 98 : 92}
            pose={art.pose}
          />
        </View>
      </PressableScale>
    </Animated.View>
  );
}
