/**
 * The destination hero: the guide's colour flooded to the top edge, the way back, SAVE, the place
 * name in the mega face, who the guide is and their line, then the facts as chips (flight time
 * from home, the exchange rate, the best months). The guide walks in from the edge as a ghosted
 * sticker, sits, and bobs; reduced motion shows it seated.
 */
import { tokens } from '@cp/design-tokens';
import { upper } from '@cp/i18n';
import type { MediaAsset } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { bezierEasing, useLoop } from '@/motion';
import { useReducedImpactMotion } from '@/motion/patterns/shared';
import { InfoPill } from '@/ui/chips/InfoPill';
import { Row } from '@/ui/layout/Row';
import { MediaLayer } from '@/ui/media/MediaLayer';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { Sticker } from '@/ui/sticker/Sticker';
import { SurfaceToneProvider } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { Halftone } from '@/ui/textures/halftone';
import { makeStyles, useTheme } from '@/ui/theme';

import type { GuideFacts } from '../format';
import { SaveButton } from './save-button';

const GHOST_SIZE = 132;
/** The ghosted guide: paper at a third, as the render draws it over the hero colour. */
const GHOST_ALPHA = '55';
const WALK_FROM = 160;
/** Smallest size the name shrinks to (a 13-letter city on a 360 pt phone). */
const NAME_FLOOR = 40;
const walkEasing = bezierEasing(tokens.motion.easing.standard);

const useStyles = makeStyles((t) => ({
  hero: {
    borderBottomLeftRadius: t.radius.heroBottom,
    borderBottomRightRadius: t.radius.heroBottom,
    paddingHorizontal: t.size.gutter,
    paddingBottom: t.space['24'],
    overflow: 'hidden',
    gap: t.space['8'],
  },
  ghost: { position: 'absolute', end: t.space['12'], bottom: t.space['32'] },
  line: { maxWidth: '62%' },
  chips: { gap: t.space['6'], marginTop: t.space['4'], alignItems: 'flex-start' },
}));

/** Names up to this many characters are set on one line. */
const ONE_LINE_NAME = 10;

function nameLines(name: string): number {
  const trimmed = name.trim();
  return trimmed.length <= ONE_LINE_NAME ? 1 : Math.min(3, trimmed.split(/\s+/u).length);
}

export interface DestHeroProps {
  readonly name: string;
  readonly guide: GuideFacts;
  readonly tagline: string;
  /** Where back goes, as the eyebrow names it ("Explore", or the country on a guest page). */
  readonly backLabel: string;
  readonly onBack: () => void;
  readonly saved: boolean;
  readonly onToggleSave: () => void;
  /** Already worded facts, in display order. */
  readonly chips: readonly string[];
  readonly photo: MediaAsset | null;
}

function GhostGuide({ guide }: { readonly guide: GuideFacts }) {
  const styles = useStyles();
  const theme = useTheme();
  const reduced = useReducedImpactMotion();
  const offset = useSharedValue(reduced ? 0 : WALK_FROM);
  const bob = useLoop('bob');
  useEffect(() => {
    offset.value = reduced
      ? 0
      : withTiming(0, { duration: tokens.motion.duration.extra, easing: walkEasing });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- offset is a stable shared value ref.
  }, [reduced]);
  const walk = useAnimatedStyle(() => ({ transform: [{ translateX: offset.value }] }));
  return (
    <Animated.View style={[styles.ghost, walk]} pointerEvents="none">
      <Animated.View style={bob}>
        <Sticker
          kind={guide.kind}
          name={guide.name}
          size={GHOST_SIZE}
          variant="mask"
          maskColor={`${theme.color.paper.base}${GHOST_ALPHA}`}
          sticker={null}
        />
      </Animated.View>
    </Animated.View>
  );
}

export function DestHero(props: DestHeroProps) {
  const styles = useStyles();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { t, i18n } = useLingui();
  const { guide } = props;
  const who = guide.guest
    ? t({ id: 'explore.hero.guestGuide', message: `Guest guide: ${guide.name}` })
    : t({ id: 'explore.hero.yourGuide', message: `Your guide: ${guide.name}` });
  return (
    <View
      style={[
        styles.hero,
        { backgroundColor: guide.colour, paddingTop: insets.top + theme.space['8'] },
      ]}
      testID="explore-hero"
    >
      <SurfaceToneProvider value="accent">
        {props.photo === null ? <Halftone /> : null}
        <MediaLayer media={props.photo} surface="accent" accent={guide.colour} creditAt="bottom" />
        <GhostGuide guide={guide} />
        <Row justify="space-between" align="center">
          <BackEyebrow label={props.backLabel} onPress={props.onBack} testID="explore-back" />
          <SaveButton saved={props.saved} onToggle={props.onToggleSave} />
        </Row>
        {/* A short name stays on one line at the size that fits ("ĐÀ NẴNG" as wide as "KYOTO"); a
            longer one takes a line per word, with a floor low enough that a long single word
            shrinks to fit instead of breaking mid-word or cutting off. */}
        <Text
          variant="displayMega"
          autoFit
          autoFitMinSize={NAME_FLOOR}
          numberOfLines={nameLines(props.name)}
          testID="explore-hero-name"
        >
          {upper(props.name, i18n.locale)}
        </Text>
        <Text variant="label" singleLine={false}>
          {upper(who, i18n.locale)}
        </Text>
        <Text variant="voice" color={theme.semantic.text.onAccent} style={styles.line}>
          {props.tagline}
        </Text>
        <View style={styles.chips} testID="explore-hero-facts">
          {props.chips.map((chip) => (
            <InfoPill key={chip}>{upper(chip, i18n.locale)}</InfoPill>
          ))}
        </View>
      </SurfaceToneProvider>
    </View>
  );
}
