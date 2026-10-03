/**
 * Card 1, the cover (3m-3): on the guide's colour, the trip's stickers slap down one by one around
 * the page (the guide and the forms found), then the place name slams into the middle and the page
 * shakes, over the crew and dates and three chips (days, travellers, sunrise starts).
 */
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { useSlap } from '@/motion/patterns/slap';
import { useStamp } from '@/motion/patterns/stamp';
import { GUIDE_STICKERS } from '@/ui/avatar/guides';
import { InfoPill } from '@/ui/chips/InfoPill';
import { Row } from '@/ui/layout/Row';
import type { GuideId } from '@/ui/people/GuideLine';
import { Sticker } from '@/ui/sticker/Sticker';
import { SurfaceToneProvider } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { Halftone } from '@/ui/textures/halftone';
import { makeStyles } from '@/ui/theme';

import { artKind, formSpec } from '../data/critter-art';
import type { FormRow } from '../data/recap-rows';
import { useCardTimeline } from '../story/use-card-timeline';

/** Where the stickers land, as fractions of the card, and their size. */
const SPOTS = [
  { x: 0.58, y: 0.1, size: 120 },
  { x: 0.06, y: 0.14, size: 88 },
  { x: 0.1, y: 0.72, size: 84 },
  { x: 0.66, y: 0.7, size: 92 },
  { x: 0.36, y: 0.8, size: 72 },
] as const;
const SLAP_GAP_MS = 300;

const useStyles = makeStyles((th) => ({
  ground: { flex: 1, overflow: 'hidden' },
  centre: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: th.size.gutter,
    gap: th.space['12'],
  },
}));

export interface CoverCardProps {
  readonly guide: GuideId;
  readonly ground: string;
  readonly eyebrow: string;
  readonly place: string;
  readonly chips: readonly string[];
  readonly forms: readonly FormRow[];
}

function Slapped({
  index,
  landed,
  children,
}: {
  readonly index: number;
  readonly landed: boolean;
  readonly children: React.ReactNode;
}) {
  const spot = SPOTS[index % SPOTS.length] ?? SPOTS[0];
  const slap = useSlap({ active: landed, direction: index % 2 === 0 ? 1 : -1 });
  return (
    <Animated.View
      style={[{ position: 'absolute', left: `${spot.x * 100}%`, top: `${spot.y * 100}%` }, slap]}
    >
      {children}
    </Animated.View>
  );
}

export function CoverCard({ guide, ground, eyebrow, place, chips, forms }: CoverCardProps) {
  const styles = useStyles();
  const art = GUIDE_STICKERS[guide];
  const stickers = forms.slice(0, SPOTS.length - 1);
  const steps = [...[art, ...stickers].map((_, index) => 200 + index * SLAP_GAP_MS)];
  const slamAt = (steps.at(-1) ?? 0) + SLAP_GAP_MS;
  const reached = useCardTimeline([...steps, slamAt]);
  const slam = useStamp({ active: reached > steps.length });
  return (
    <View style={[styles.ground, { backgroundColor: ground }]} testID="recap-card-cover">
      <SurfaceToneProvider value="accent">
        <Halftone />
        <Slapped index={0} landed={reached > 0}>
          <Sticker kind={art.kind} name={art.name} size={SPOTS[0].size} pose="cheer" />
        </Slapped>
        {stickers.map((form, i) => {
          const spec = formSpec(form);
          const spot = SPOTS[i + 1] ?? SPOTS[0];
          return (
            <Slapped key={form.id} index={i + 1} landed={reached > i + 1}>
              <Sticker
                kind={artKind(form.critter_key)}
                name={form.city ?? ''}
                size={spot.size}
                {...(spec === null ? {} : { form: spec })}
              />
            </Slapped>
          );
        })}
        <View style={styles.centre} pointerEvents="none">
          <Text variant="eyebrow">{eyebrow}</Text>
          <Animated.View style={slam}>
            <Text
              variant="displayMega"
              accessibilityRole="header"
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {place}
            </Text>
          </Animated.View>
          <Row gap="6" wrap justify="center">
            {chips.map((chip) => (
              <InfoPill key={chip}>{chip}</InfoPill>
            ))}
          </Row>
        </View>
      </SurfaceToneProvider>
    </View>
  );
}
