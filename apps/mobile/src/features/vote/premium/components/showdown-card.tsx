/**
 * One finalist on the showdown (4.05): a white guide card with the guide's sticker overhanging its
 * top corner, the place tag, the guide's pitch line, the fact chips, and a footer with who voted
 * for it, a bar filling to its share in the place's colour, and the count. The other card dims a
 * little once the viewer has picked; the bar and the faces move on Smooth.
 */
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import {
  CritterSticker,
  CrewStack,
  REDUCED_FADE,
  SPRINGS,
  Tag,
  Text,
  makePremiumStyles,
  ring,
  usePremiumReducedMotion,
  usePremiumTheme,
  type CrewMember,
} from '@/ui/premium';

/** The guide's sticker hangs off the card's top corner by this much of its size. */
const STICKER = 132;
const STICKER_LIFT = 20;
const STICKER_OUT = 6;
/** The tag's tilt on the top card and the bottom one (design: −6° / +4°). */
const TAG_TILT = [-6, 4] as const;
/** The non-picked card's opacity once the viewer has voted. */
const DIMMED = 0.72;
/** The pitch line keeps clear of the guide's sticker. */
const LINE_WIDTH = '62%';

const useStyles = makePremiumStyles((t) => ({
  card: {
    borderRadius: t.radius.button,
    backgroundColor: t.color.card,
    boxShadow: t.shadow.card,
    paddingHorizontal: t.space.gutter,
    paddingTop: t.space.gutter,
    paddingBottom: t.space.gap16,
    gap: t.space.gap12,
  },
  mine: { boxShadow: `${ring(t.size.focusRing, t.color.ink)}, ${t.shadow.card}` },
  sticker: { position: 'absolute', top: -STICKER_LIFT, end: -STICKER_OUT },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space.gap6 },
  chip: {
    height: t.size.statusTag + 2,
    borderRadius: t.radius.statusTag + 1,
    paddingHorizontal: t.space.statusTagPadH + 1,
    backgroundColor: t.color.control,
    justifyContent: 'center',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space.gap12,
    marginTop: t.space.gap4,
  },
  track: {
    flex: 1,
    height: t.size.progressStep + 1,
    borderRadius: t.radius.progressStep,
    backgroundColor: t.color.control,
    overflow: 'hidden',
  },
}));

export interface ShowdownCardProps {
  readonly index: 0 | 1;
  readonly name: string;
  readonly colour: string;
  readonly guide: { readonly kind: string; readonly name: string };
  readonly quote: string | null;
  readonly facts: readonly string[];
  readonly voters: readonly CrewMember[];
  readonly votersLabel: string;
  /** 0–1 of the votes cast. */
  readonly share: number;
  /** "3 votes", or "1 vote · Dev, Rin to go". */
  readonly countLine: string;
  /** The count is the headline (the leader's) or a muted line. */
  readonly countStrong: boolean;
  readonly mine: boolean;
  readonly dimmed: boolean;
  readonly accessibilityLabel: string;
}

export function ShowdownCard({
  index,
  name,
  colour,
  guide,
  quote,
  facts,
  voters,
  votersLabel,
  share,
  countLine,
  countStrong,
  mine,
  dimmed,
  accessibilityLabel,
}: ShowdownCardProps) {
  const styles = useStyles();
  const reduced = usePremiumReducedMotion();
  const fill = useSharedValue(share);
  const fade = useSharedValue(dimmed ? DIMMED : 1);
  useEffect(() => {
    fill.set(reduced ? withTiming(share, REDUCED_FADE) : withSpring(share, SPRINGS.smooth));
  }, [share, reduced, fill]);
  useEffect(() => {
    const to = dimmed ? DIMMED : 1;
    fade.set(reduced ? withTiming(to, REDUCED_FADE) : withSpring(to, SPRINGS.smooth));
  }, [dimmed, reduced, fade]);
  const bar = useAnimatedStyle(() => ({ width: `${Math.max(0, Math.min(1, fill.value)) * 100}%` }));
  const look = useAnimatedStyle(() => ({ opacity: fade.value }));

  return (
    <Animated.View
      style={[styles.card, mine ? styles.mine : null, look]}
      accessible
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected: mine }}
      testID={`showdown-half-${index}`}
    >
      <View style={styles.sticker} pointerEvents="none" testID={`showdown-guide-${index}`}>
        <CritterSticker kind={guide.kind} name={guide.name} size={STICKER} pose="wave" />
      </View>
      <Tag label={name} color={colour} rotate={TAG_TILT[index]} testID={`showdown-name-${index}`} />
      {quote === null ? null : (
        <Text
          variant="navTitle"
          style={{ maxWidth: LINE_WIDTH }}
          testID={`showdown-quote-${index}`}
        >
          {quote}
        </Text>
      )}
      {facts.length === 0 ? null : (
        <View style={styles.chips} testID={`showdown-facts-${index}`}>
          {facts.map((fact) => (
            <View key={fact} style={styles.chip}>
              <Text variant="helper" tone="inkSecondary" numberOfLines={1}>
                {fact}
              </Text>
            </View>
          ))}
        </View>
      )}
      <View style={styles.footer} testID={`showdown-votes-${index}`}>
        {voters.length > 0 ? (
          <CrewStack members={voters} size={26} max={5} accessibilityLabel={votersLabel} />
        ) : null}
        <View style={styles.track}>
          <Animated.View style={[{ height: '100%', backgroundColor: colour }, bar]} />
        </View>
        <Text
          variant={countStrong ? 'rowTitle' : 'label'}
          tone={countStrong ? 'ink' : 'muted'}
          numberOfLines={1}
        >
          {countLine}
        </Text>
      </View>
    </Animated.View>
  );
}

/** The ink VS disc where the two cards meet, ringed in the ground colour. */
export function VsDisc({ label }: { readonly label: string }) {
  const t = usePremiumTheme();
  const side = t.size.button;
  return (
    <View
      pointerEvents="none"
      importantForAccessibility="no-hide-descendants"
      style={{ height: 0, alignItems: 'center', justifyContent: 'center', zIndex: 5 }}
    >
      <View
        style={{
          width: side,
          height: side,
          borderRadius: side / 2,
          backgroundColor: t.color.ink,
          borderWidth: t.space.gap4 + 1,
          borderColor: t.color.ground,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text variant="headline" tone="onInk" style={{ fontWeight: '800' }}>
          {label}
        </Text>
      </View>
    </View>
  );
}
