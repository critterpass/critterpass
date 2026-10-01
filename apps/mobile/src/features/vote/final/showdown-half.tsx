/**
 * One side of the showdown: the place's name over its colour, the guide's line from the pitch, the
 * tool chips (flight hours, price each, best months) and who voted for it, with the guide's pale
 * silhouette wiggling beside them. The viewer's side wears a ring; choosing it squashes the half
 * from the VS edge.
 */
import { tokens } from '@cp/design-tokens';
import type { MediaAsset } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { bezierEasing, useLoop, useMotionMode } from '@/motion';
import { GUIDE_STICKERS } from '@/ui/avatar/guides';
import { Row } from '@/ui/layout/Row';
import { MediaLayer } from '@/ui/media/MediaLayer';
import { AvatarStack } from '@/ui/people/AvatarStack';
import { Sticker } from '@/ui/sticker/Sticker';
import { Text } from '@/ui/text/Text';
import { makeStyles, sizeToken, useTheme } from '@/ui/theme';

import type { BoardPlace } from '../data/use-board';
import type { usePitchSections } from '../data/use-final';
import { stackOf, type Person } from '../data/use-people';
import type { PollOptionView } from '../data/poll-view';
import { guideOr, upper } from '../format';
import { ShowdownFacts } from './showdown-facts';
import type { NameMeasure } from './showdown-name-fit';
import { Wordmark } from './wordmark';

/** The size the render sets a finalist's name at. */
const NAME_SIZE = 138;
/** Widest the guide's line grows; the guide's silhouette sits in the rest of the half. */
const COLUMN = '62%';
/** The guide's silhouette beside its line and chips. */
const GHOST_SIZE = 136;
const GHOST_OPACITY = 0.45;

/** Showdown stacks show this many voters before "+n" (boosted crews reach sixteen). */
const MAX_AVATARS = 16;

const SQUASH_EASING = bezierEasing(tokens.motion.easing.standard);
/** Two segments of the 460 ms squash. */
const SQUASH_SEGMENT_MS = 230;

/**
 * The squash a half does when it becomes the viewer's pick: sx1.14/sy.86 → .94/1.06 → rest, from
 * the edge that meets the VS disc. Only the scale moves; a half is always fully visible, whether
 * or not it has ever been chosen. Reduced motion keeps it still.
 */
function useChosenSquash(chosen: boolean) {
  const scaleX = useSharedValue(1);
  const scaleY = useSharedValue(1);
  const [mode] = useMotionMode();
  useEffect(() => {
    if (!chosen || mode !== 'full') return;
    scaleX.value = 1.14;
    scaleY.value = 0.86;
    scaleX.value = withSequence(
      withTiming(0.94, { duration: SQUASH_SEGMENT_MS, easing: SQUASH_EASING }),
      withTiming(1, { duration: SQUASH_SEGMENT_MS, easing: SQUASH_EASING }),
    );
    scaleY.value = withSequence(
      withTiming(1.06, { duration: SQUASH_SEGMENT_MS, easing: SQUASH_EASING }),
      withTiming(1, { duration: SQUASH_SEGMENT_MS, easing: SQUASH_EASING }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- shared values are stable refs.
  }, [chosen, mode]);
  return useAnimatedStyle(() => ({
    transform: [{ scaleX: scaleX.value }, { scaleY: scaleY.value }],
  }));
}

const useStyles = makeStyles((th) => ({
  // Each half is at least as tall as its content and shares what is left of the screen with the
  // other, so neither is ever clipped under the header or the tally card.
  press: { flexGrow: 1, flexShrink: 0, flexBasis: 'auto' },
  half: {
    flexGrow: 1,
    paddingHorizontal: th.space['20'],
    justifyContent: 'flex-start',
    overflow: 'hidden',
    gap: th.space['10'],
  },
  // Content starts right under each half's top edge: under the screen header for the top half, and
  // for the bottom one under the VS disc, which the display name's own leading already clears.
  top: { paddingBottom: sizeToken(th.size.fab, 'size') / 2 + th.space['16'] },
  bottom: { paddingTop: th.space['8'] },
  // The guide's line, the chips and the voters, with the guide's silhouette behind them.
  pitch: { alignSelf: 'stretch', gap: th.space['10'] },
  ghost: {
    position: 'absolute',
    top: '50%',
    marginTop: -GHOST_SIZE / 2 - th.space['16'],
    opacity: GHOST_OPACITY,
  },
  quote: {
    maxWidth: COLUMN,
    backgroundColor: th.semantic.bg.raised,
    borderRadius: th.radius.lg,
    paddingHorizontal: th.space['14'],
    paddingVertical: th.space['10'],
  },
  mine: {
    borderWidth: sizeToken(th.size.fab, 'ringWidth'),
    borderColor: th.semantic.text.onAccent,
  },
}));

export function ShowdownHalf({
  option,
  place,
  photo = null,
  people,
  sectionsOf,
  alignEnd,
  onVote,
  squashKey,
  edgeInset,
  nameScale,
  nameHidden,
  onNaturalHeight,
  onNameMeasure,
}: {
  readonly option: PollOptionView;
  readonly place: BoardPlace | undefined;
  /** The place's photo under its colour; null keeps the flat colour. */
  readonly photo?: MediaAsset | null;
  readonly people: ReadonlyMap<string, Person>;
  readonly sectionsOf: ReturnType<typeof usePitchSections>;
  readonly alignEnd: boolean;
  readonly onVote: (() => void) | undefined;
  readonly squashKey: number;
  /** Room kept at the half's outer edge: the screen header above the top half, the tally card below the bottom one. */
  readonly edgeInset: number;
  /** How much smaller than its own best fit the name is set (both halves share one size); 1 = not at all. */
  readonly nameScale: number;
  /** The name is hidden while the screen searches for the size both names fit at. */
  readonly nameHidden: boolean;
  /** Reports the height the half's content needs, before it grows to share the screen. */
  readonly onNaturalHeight: (height: number) => void;
  /** Reports the name's size at its best fit and now. */
  readonly onNameMeasure: (measure: NameMeasure) => void;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const { t, i18n } = useLingui();
  const squash = useChosenSquash(squashKey > 0);
  const guideId = guideOr(place?.guide);
  const guide = GUIDE_STICKERS[guideId];
  const ink = theme.semantic.text.onAccent;
  const quote = option.pitchId === null ? null : (sectionsOf.get(option.pitchId)?.quote ?? null);
  const name = place?.name ?? option.label;
  const wiggle = useLoop('wiggle', { offset: alignEnd ? 0.5 : 0 });
  const index = alignEnd ? 1 : 0;
  const endPadding = alignEnd
    ? edgeInset
    : sizeToken(theme.size.fab, 'size') / 2 + theme.space['16'];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[
        name,
        t({ id: 'vote.showdown.votes', message: `${option.votes} votes` }),
        option.mine ? t({ id: 'vote.showdown.yours', message: 'your vote' }) : null,
      ]
        .filter((part) => part !== null)
        .join(', ')}
      accessibilityState={{ selected: option.mine, disabled: onVote === undefined }}
      onPress={onVote}
      style={styles.press}
      testID={`showdown-half-${index}`}
    >
      <Animated.View
        style={[
          styles.half,
          alignEnd ? styles.bottom : styles.top,
          alignEnd ? { paddingBottom: edgeInset } : { paddingTop: edgeInset },
          {
            backgroundColor: place?.colour ?? theme.color.yellow,
            alignItems: alignEnd ? 'flex-end' : 'flex-start',
            // The squash grows from the edge that meets the VS disc.
            transformOrigin: alignEnd ? 'top' : 'bottom',
          },
          option.mine ? styles.mine : null,
          squash,
        ]}
      >
        <MediaLayer
          media={photo}
          surface="accent"
          accent={place?.colour ?? theme.color.yellow}
          creditAt={alignEnd ? 'bottom' : 'top'}
          dots={false}
          testID={`showdown-half-photo-${index}`}
        />
        <Wordmark
          name={upper(name, i18n.locale)}
          designSize={NAME_SIZE}
          color={ink}
          align={alignEnd ? 'end' : 'start'}
          scale={nameScale}
          hidden={nameHidden}
          testID={`showdown-name-${index}`}
          onMeasure={onNameMeasure}
        />
        <View
          style={[styles.pitch, { alignItems: alignEnd ? 'flex-end' : 'flex-start' }]}
          testID={`showdown-pitch-${index}`}
          onLayout={(event) => {
            const { y, height } = event.nativeEvent.layout;
            onNaturalHeight(y + height + endPadding);
          }}
        >
          <Animated.View
            style={[
              styles.ghost,
              alignEnd ? { left: -theme.space['8'] } : { right: -theme.space['8'] },
              wiggle,
            ]}
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            testID={`showdown-guide-${index}`}
          >
            <Sticker
              kind={guide.kind}
              name={guide.name}
              variant="mask"
              maskColor={theme.color.paper.base}
              sticker={null}
              size={GHOST_SIZE}
            />
          </Animated.View>
          {quote === null ? null : (
            <View
              style={styles.quote}
              accessible
              accessibilityLabel={`${guide.name}: ${quote}`}
              testID={`showdown-quote-${index}`}
            >
              <Text variant="voice" color={tokens.guide[guideId]}>
                {quote}
              </Text>
            </View>
          )}
          <ShowdownFacts option={option} sectionsOf={sectionsOf} alignEnd={alignEnd} />
          <Row gap="8" align="center" testID={`showdown-votes-${index}`}>
            {option.voterIds.length > 0 ? (
              <AvatarStack members={stackOf(people, option.voterIds)} size="md" max={MAX_AVATARS} />
            ) : null}
            <Text variant="title" color={ink}>
              {upper(
                t({ id: 'vote.showdown.count', message: `${option.votes} votes` }),
                i18n.locale,
              )}
            </Text>
          </Row>
        </View>
      </Animated.View>
    </Pressable>
  );
}
