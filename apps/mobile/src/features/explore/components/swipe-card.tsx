/**
 * One card of the swipe deck: the photo slot in the deck's colour, who else already said yes, the
 * guide's note in a bubble with their sticker, and the yellow footer with the place's name and a
 * line of facts. The card on top follows the finger and flings past 110 pt (right is yes, left is
 * no); the one under it waits a little smaller.
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';

import { gestures, useLoop } from '@/motion';
import { Icon } from '@/ui/icons/Icon';
import { Sticker } from '@/ui/sticker/Sticker';
import { SurfaceToneProvider } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { Halftone } from '@/ui/textures/halftone';
import { makeStyles, useTheme } from '@/ui/theme';

import { categoryIcon } from '../category';
import { guideWritten } from '../data/guide-text';
import type { GuideFacts } from '../format';
import type { Verdict } from '../swipe-model';

const NOTE_STICKER = 52;
const NAME_FLOOR = 20;

export interface SwipeCardFace {
  readonly poiId: string;
  readonly name: string;
  readonly category: string;
  /** Already worded: "Temple · near the stay". */
  readonly meta: string;
  /** The guide's note for this card, when it wrote one. */
  readonly note: string | null;
  /** Already worded: "Alex + Rin said yes"; null when nobody else has. */
  readonly social: string | null;
}

const useStyles = makeStyles((t) => ({
  card: {
    flex: 1,
    borderRadius: t.radius.xl,
    overflow: 'hidden',
    backgroundColor: t.color.ink[600],
  },
  photo: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  social: {
    position: 'absolute',
    top: t.space['16'],
    end: t.space['16'],
    maxWidth: '80%',
    borderRadius: t.radius.lg,
    paddingHorizontal: t.space['12'],
    paddingVertical: t.space['6'],
    backgroundColor: t.color.pink,
  },
  note: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: t.space['8'],
    paddingHorizontal: t.space['16'],
    paddingBottom: t.space['12'],
  },
  bubble: {
    flex: 1,
    borderRadius: t.radius.md,
    padding: t.space['12'],
    backgroundColor: t.semantic.bg.base,
  },
  footer: { backgroundColor: t.semantic.action.primary, padding: t.space['16'], gap: t.space['4'] },
  under: {
    transform: [
      { translateY: gestures.NEXT_CARD_ENTRY.translateY },
      { scale: gestures.NEXT_CARD_ENTRY.scale },
    ],
  },
}));

function Face({ face, guide }: { readonly face: SwipeCardFace; readonly guide: GuideFacts }) {
  const styles = useStyles();
  const theme = useTheme();
  const { i18n } = useLingui();
  return (
    <View style={styles.card}>
      <View style={styles.photo}>
        <Halftone variant="dark" />
        <Icon
          name={categoryIcon(face.category)}
          size={84}
          color={theme.semantic.text.secondary}
          decorative
        />
        {face.social === null ? null : (
          <View style={styles.social} testID="explore-swipe-social">
            <Text variant="label" color={theme.semantic.text.onAccent} singleLine={false}>
              {upper(face.social, i18n.locale)}
            </Text>
          </View>
        )}
      </View>
      {face.note === null ? null : (
        <View style={styles.note}>
          <View style={styles.bubble}>
            <Text variant="voice" color={guide.colour}>
              {guideWritten(face.note, i18n.locale)}
            </Text>
          </View>
          <Sticker kind={guide.kind} name={guide.name} size={NOTE_STICKER} />
        </View>
      )}
      <SurfaceToneProvider value="accent">
        <View style={styles.footer}>
          {/* A long name shrinks to fit its three lines instead of being cut. */}
          <Text variant="h2" autoFit autoFitMinSize={NAME_FLOOR} testID="explore-swipe-name">
            {upper(face.name, i18n.locale)}
          </Text>
          <Text variant="bodySm">{face.meta}</Text>
        </View>
      </SurfaceToneProvider>
    </View>
  );
}

export interface SwipeCardProps {
  readonly face: SwipeCardFace;
  readonly guide: GuideFacts;
  readonly onSwiped: (verdict: Verdict) => void;
}

/** The card on top: follows the finger, flings on release past the commit distance. */
export function SwipeCard({ face, guide, onSwiped }: SwipeCardProps) {
  const { t } = useLingui();
  const sway = useLoop('wiggle');
  const deck = gestures.useSwipeDeck({
    onSwiped: (direction) => onSwiped(direction === 'right' ? 'yes' : 'no'),
    accessibilityLabel: t({
      id: 'explore.swipe.cardActions',
      message: 'Swipe right for yes, left for no',
    }),
  });
  return (
    <GestureDetector gesture={deck.gesture}>
      <Animated.View
        style={[{ flex: 1 }, deck.animatedStyle]}
        accessible
        accessibilityLabel={`${face.name}, ${face.meta}`}
        accessibilityActions={deck.accessibilityActions}
        onAccessibilityAction={deck.onAccessibilityAction}
        testID="explore-swipe-card"
      >
        <Animated.View style={[{ flex: 1 }, sway]}>
          <Face face={face} guide={guide} />
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}

/** The next card, waiting under the one on top. */
export function SwipeCardUnder({ face, guide }: Omit<SwipeCardProps, 'onSwiped'>) {
  const styles = useStyles();
  return (
    <View
      style={[{ flex: 1 }, styles.under]}
      pointerEvents="none"
      importantForAccessibility="no-hide-descendants"
    >
      <Face face={face} guide={guide} />
    </View>
  );
}
