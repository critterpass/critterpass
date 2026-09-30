/**
 * The wallet's card stack (3h-1): closed bookings as overlapping coloured headers, 58 pt apart,
 * with the open one in full at the front. Tapping a header brings it to the front. Pulling the
 * stack down fans the cards apart (each gap grows with the drag, rubber-banded) and they spring
 * back on release; reduced motion keeps the stack still.
 */
import { tokens } from '@cp/design-tokens';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';

import { isPhysicalSpring, springConfig } from '@/motion/easing';
import { useMotionMode } from '@/motion/motion-mode';
import type { CardTone } from '@/ui/cards/tone';
import { cardBackground, surfaceToneOf } from '@/ui/cards/tone';
import type { DoodleName } from '@/ui/icons/generated';
import { Icon } from '@/ui/icons/Icon';
import { Row } from '@/ui/layout/Row';
import { PressScale } from '@/ui/press/PressScale';
import { SurfaceToneProvider } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

/** Visible height of a closed card. */
export const COLLAPSED_OFFSET = 58;
const OVERLAP = 22;
/** How far each gap opens per point of (rubber-banded) pull. */
const FAN_PER_CARD = 0.45;
const PULL_LIMIT = 220;

const GENTLE = isPhysicalSpring(tokens.motion.spring.gentle)
  ? springConfig(tokens.motion.spring.gentle)
  : undefined;

/** A pull that slows the further it goes and never passes `PULL_LIMIT`. */
export function rubberBand(drag: number): number {
  'worklet';
  if (drag <= 0) return 0;
  return (drag * PULL_LIMIT) / (drag + PULL_LIMIT);
}

export interface DeckItem {
  readonly key: string;
  readonly title: string;
  readonly meta: string;
  readonly tone: CardTone;
  readonly icon: DoodleName;
}

export interface BookingDeckProps {
  readonly closed: readonly DeckItem[];
  readonly open: { readonly key: string; readonly tone: CardTone } | null;
  readonly onSelect: (key: string) => void;
  /** The open booking's body. */
  readonly children: ReactNode;
  readonly testID?: string;
}

const useStyles = makeStyles((t) => ({
  header: {
    minHeight: COLLAPSED_OFFSET + OVERLAP,
    borderTopLeftRadius: t.radius.cardBig,
    borderTopRightRadius: t.radius.cardBig,
    paddingHorizontal: t.size.cardInner.max,
    paddingTop: t.space['16'],
    paddingBottom: OVERLAP,
  },
  overlap: { marginTop: -OVERLAP },
  open: { borderRadius: t.radius.cardBig, padding: t.size.cardInner.max, overflow: 'hidden' },
  title: { flex: 1 },
}));

function useFan(pull: SharedValue<number>, index: number) {
  return useAnimatedStyle(() => ({
    transform: [{ translateY: pull.value * FAN_PER_CARD * index }],
  }));
}

function ClosedCard({
  item,
  index,
  pull,
  onSelect,
}: {
  readonly item: DeckItem;
  readonly index: number;
  readonly pull: SharedValue<number>;
  readonly onSelect: (key: string) => void;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const fan = useFan(pull, index);
  return (
    <Animated.View style={[index > 0 ? styles.overlap : null, fan]}>
      <PressScale
        onPress={() => onSelect(item.key)}
        widthClass="wide"
        accessibilityLabel={`${item.title}, ${item.meta}`}
        accessibilityState={{ selected: false }}
        style={[styles.header, { backgroundColor: cardBackground(theme, item.tone) }]}
        testID={`bookings-card-${item.key}`}
      >
        <SurfaceToneProvider value={surfaceToneOf(item.tone)}>
          <Row gap="8" align="center">
            <Icon name={item.icon} size={24} decorative />
            <Text variant="title" style={styles.title} numberOfLines={1}>
              {item.title}
            </Text>
            <Text variant="label">{item.meta}</Text>
          </Row>
        </SurfaceToneProvider>
      </PressScale>
    </Animated.View>
  );
}

export function BookingDeck({ closed, open, onSelect, children, testID }: BookingDeckProps) {
  const styles = useStyles();
  const theme = useTheme();
  const [motionMode] = useMotionMode();
  const pull = useSharedValue(0);
  const pan = Gesture.Pan()
    .enabled(motionMode === 'full' && closed.length > 0)
    .activeOffsetY(12)
    .failOffsetY(-8)
    .failOffsetX([-20, 20])
    .onUpdate((event) => {
      'worklet';
      pull.value = rubberBand(event.translationY);
    })
    .onFinalize(() => {
      'worklet';
      pull.value = withSpring(0, GENTLE);
    });
  const openFan = useFan(pull, closed.length);
  return (
    <GestureDetector gesture={pan}>
      <View testID={testID}>
        {closed.map((item, index) => (
          <ClosedCard key={item.key} item={item} index={index} pull={pull} onSelect={onSelect} />
        ))}
        {open === null ? null : (
          <Animated.View
            style={[
              styles.open,
              closed.length > 0 ? styles.overlap : null,
              { backgroundColor: cardBackground(theme, open.tone) },
              openFan,
            ]}
            accessibilityState={{ selected: true }}
            testID={`bookings-open-${open.key}`}
          >
            <SurfaceToneProvider value={surfaceToneOf(open.tone)}>{children}</SurfaceToneProvider>
          </Animated.View>
        )}
      </View>
    </GestureDetector>
  );
}
