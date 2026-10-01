/**
 * The winner reveal as it is drawn (3c-2): the winner's colour and photo take the screen with a
 * burst, the guide hops in front of the turning rays, the place's name stamps down under it with
 * the score, then the tally card, the losing guide asleep beside its consolation line, the call to
 * action and the line that sends the loser back to the deck. The words arrive as props, so the
 * screen and a lab scene draw the same stage.
 */
import { LinearGradient, Rect, vec } from '@shopify/react-native-skia';
import { useRef, useState, type ReactNode } from 'react';
import { useWindowDimensions, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { deviceTier, patterns, useLoop } from '@/motion';
import type { MediaView } from '@/lib/media/variants';
import { PillButton } from '@/ui/buttons/PillButton';
import { InfoPill } from '@/ui/chips/InfoPill';
import { Row } from '@/ui/layout/Row';
import { MediaLayer } from '@/ui/media/MediaLayer';
import { LiveSticker } from '@/ui/people/LiveSticker';
import { SurfaceToneProvider } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { Halftone } from '@/ui/textures/halftone';
import { TextureCanvas } from '@/ui/textures/TextureCanvas';
import { makeStyles, sizeToken, useTheme } from '@/ui/theme';
import { Burst } from '@/ui/transitions/Burst';

import { RevealRays } from './reveal-rays';
import { RevealTally, type RevealTallyRow } from './reveal-tally';
import { useRevealTimeline } from './reveal-timeline';
import { Wordmark } from './wordmark';

/** The size and the line the render sets the winner's name on. */
const NAME_SIZE = 124;
const NAME_LEADING = 0.8;
/** The size the render sets the score at. */
const SCORE_SIZE = 30;
/**
 * The winning guide's sticker: the render's 206 pt when the room above the name allows, and no
 * smaller than 96. The art sits inside its box with room to spare, so the box may run a little past
 * that room.
 */
const STICKER = { min: 96, max: 206, fallback: 206, share: 1.1 } as const;
/** The rays reach this many sticker sizes across. */
const RAYS_SPAN = 2.2;
const SLEEPER_SIZE = 48;
/** How strongly the winner's colour is washed back in behind the name and score, over a photo. */
const WASH_STRENGTH = 0.85;

export interface RevealGuide {
  readonly kind: string;
  readonly name: string;
}

export interface RevealStageProps {
  readonly colour: string;
  readonly photo: MediaView | null;
  /** "WHERE NEXT? · FINAL". */
  readonly eyebrow: string;
  /** "6 OF 6 VOTED". */
  readonly voted: string;
  readonly guide: RevealGuide;
  /** The winner's name, in the case it is drawn in. */
  readonly name: string;
  /** "WINS 4–2". */
  readonly score: string;
  readonly tallySummary: string;
  readonly rows: readonly RevealTallyRow[];
  /** Lines for the viewer inside the tally card (a tie broken, a missed vote, a losing pick). */
  readonly notes?: ReactNode;
  /** The losing guide and its line. */
  readonly consolation: { readonly guide: RevealGuide; readonly line: string } | null;
  /** The organiser's button, or the line saying who has the setup. */
  readonly action: ReactNode;
  /** "Lisbon goes back in the deck for next time". */
  readonly backInDeck: string | null;
  /** Holds the entrance at this moment, in milliseconds (lab captures). */
  readonly holdAt?: number | undefined;
}

const useStyles = makeStyles((th) => ({
  screen: { flex: 1, overflow: 'hidden' },
  fill: { flex: 1 },
  // Above the rays, which reach up behind it.
  header: { paddingHorizontal: th.space['20'], zIndex: 1 },
  hero: { flex: 1, paddingHorizontal: th.space['20'] },
  stickerSlot: { flex: 1, minHeight: STICKER.min, alignItems: 'center', justifyContent: 'center' },
  title: { alignSelf: 'stretch', gap: th.space['8'], paddingBottom: th.space['16'] },
  wash: { top: -th.space['24'], bottom: 0, left: -th.space['20'], right: -th.space['20'] },
  centred: { textAlign: 'center' },
  foot: { paddingHorizontal: th.space['20'], gap: th.space['16'] },
  rest: { gap: th.space['12'] },
  consolation: { paddingHorizontal: th.space['4'] },
  action: {
    backgroundColor: th.semantic.bg.base,
    borderRadius: sizeToken(th.size.primaryCta, 'radius'),
  },
  line: { flex: 1 },
}));

/** `#rrggbb` with an alpha channel. */
function withAlpha(hex: string, alpha: number): string {
  const channel = Math.round(alpha * 255)
    .toString(16)
    .padStart(2, '0');
  return `${hex}${channel}`;
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

/**
 * The organiser's call to action as the render draws it on the winner's colour: an ink pill with
 * the label in the action yellow.
 */
export function RevealAction({
  label,
  onPress,
}: {
  readonly label: string;
  readonly onPress: () => void;
}) {
  const styles = useStyles();
  return (
    <View style={styles.action}>
      <PillButton variant="tertiary" label={label} onPress={onPress} testID="reveal-set-up" />
    </View>
  );
}

export function RevealStage({
  colour,
  photo,
  eyebrow,
  voted,
  guide,
  name,
  score,
  tallySummary,
  rows,
  notes,
  consolation,
  action,
  backInDeck,
  holdAt,
}: RevealStageProps) {
  const styles = useStyles();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const ink = theme.semantic.text.onAccent;
  const hop = useLoop('hop');
  const [slot, setSlot] = useState(0);
  const sticker =
    slot > 0 ? clamp(slot * STICKER.share, STICKER.min, STICKER.max) : STICKER.fallback;
  // Where the name lands on the screen, for the confetti that bursts from under it.
  const landing = useRef({ hero: 0, title: 0, height: 0 });
  const timeline = useRevealTimeline({
    holdAt,
    onLand: () => {
      const { hero, title, height } = landing.current;
      patterns.triggerConfetti(window.width / 2, hero + title + height / 2, 'large', deviceTier);
    },
  });
  return (
    <View style={[styles.screen, { backgroundColor: colour }]} testID="winner-reveal">
      <Burst testID="reveal-burst">
        {/* The celebration flood wears its halftone; over a photo the photo layer draws it, lighter. */}
        {photo === null ? <Halftone /> : null}
        <MediaLayer media={photo} surface="accent" accent={colour} testID="winner-reveal-photo" />
        <SurfaceToneProvider value="accent">
          <Row
            justify="space-between"
            align="center"
            style={[styles.header, { paddingTop: insets.top + theme.space['16'] }]}
          >
            <Text variant="label" color={ink}>
              {eyebrow}
            </Text>
            <InfoPill testID="reveal-voted">{voted}</InfoPill>
          </Row>
          <View
            style={styles.hero}
            onLayout={(event) => {
              landing.current.hero = event.nativeEvent.layout.y;
            }}
          >
            <View
              style={styles.stickerSlot}
              onLayout={(event) => setSlot(event.nativeEvent.layout.height)}
            >
              <RevealRays size={sticker * RAYS_SPAN} />
              <Animated.View style={hop}>
                <LiveSticker kind={guide.kind} name={guide.name} size={sticker} drawOn={false} />
              </Animated.View>
            </View>
            <View
              style={styles.title}
              onLayout={(event) => {
                landing.current.title = event.nativeEvent.layout.y;
                landing.current.height = event.nativeEvent.layout.height;
              }}
            >
              {/* Over a photo the winner's colour comes back behind the name and the score only. */}
              {photo === null ? null : (
                <TextureCanvas style={styles.wash} testID="reveal-wash">
                  {({ width, height }) => (
                    <Rect x={0} y={0} width={width} height={height}>
                      <LinearGradient
                        start={vec(0, 0)}
                        end={vec(0, height)}
                        colors={[
                          withAlpha(colour, 0),
                          withAlpha(colour, WASH_STRENGTH),
                          withAlpha(colour, WASH_STRENGTH),
                          withAlpha(colour, 0),
                        ]}
                        positions={[0, 0.3, 0.8, 1]}
                      />
                    </Rect>
                  )}
                </TextureCanvas>
              )}
              <Animated.View style={timeline.stamp} testID="reveal-stamp">
                <Wordmark
                  name={name}
                  designSize={NAME_SIZE}
                  leading={NAME_LEADING}
                  color={ink}
                  align="center"
                  accessibilityRole="header"
                  testID="reveal-name"
                />
              </Animated.View>
              <Animated.View style={timeline.score}>
                <Text
                  variant="h2"
                  designSize={SCORE_SIZE}
                  color={ink}
                  style={styles.centred}
                  testID="reveal-score"
                >
                  {score}
                </Text>
              </Animated.View>
            </View>
          </View>
          <View style={[styles.foot, { paddingBottom: insets.bottom + theme.space['16'] }]}>
            <Animated.View style={timeline.tally}>
              <RevealTally summary={tallySummary} rows={rows}>
                {notes}
              </RevealTally>
            </Animated.View>
            <Animated.View style={[styles.rest, timeline.rest]}>
              {consolation === null ? null : (
                <Row gap="12" align="center" style={styles.consolation}>
                  <LiveSticker
                    kind={consolation.guide.kind}
                    name={consolation.guide.name}
                    pose="sleep"
                    size={SLEEPER_SIZE}
                    drawOn={false}
                    blinks={false}
                  />
                  <Text variant="voice" color={ink} style={styles.line} testID="reveal-consolation">
                    {consolation.line}
                  </Text>
                </Row>
              )}
              {action}
              {backInDeck === null ? null : (
                <Text variant="bodySm" color={ink} style={styles.centred}>
                  {backInDeck}
                </Text>
              )}
            </Animated.View>
          </View>
        </SurfaceToneProvider>
      </Burst>
    </View>
  );
}
