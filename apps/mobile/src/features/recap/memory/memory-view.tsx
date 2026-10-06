/**
 * The year-later memory (3m-10) from props: the highlight photo full-bleed at the top drifting in
 * slowly (1.08 → 1 over 8 s; still under Reduce Motion), or the hatched placeholder when the trip
 * has none, fading into the night; "ONE YEAR AGO TODAY" and ✕ over it; the guide bobbing in the
 * photo's corner; "{PLACE}, A YEAR ON" with the day and the moment it calls back; the crew's
 * reactions popping in as they land, with a chip to add one's own; PLAN A REUNION (for travellers
 * still in the crew) and "Share the memory".
 */
import { tokens } from '@cp/design-tokens';
import { useLingui } from '@lingui/react/macro';
import { Canvas, LinearGradient, Rect, vec } from '@shopify/react-native-skia';
import { useEffect, useState } from 'react';
import { Image, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  ZoomIn,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLoop } from '@/motion';
import { bezierEasing } from '@/motion/easing';
import { useReducedImpactMotion } from '@/motion/patterns/shared';
import { IconButton } from '@/ui/buttons/IconButton';
import { PillButton } from '@/ui/buttons/PillButton';
import { TextLink } from '@/ui/buttons/TextLink';
import { Row } from '@/ui/layout/Row';
import { isFormerMember } from '@/ui/people/member-name';
import { Tag } from '@/ui/plan/ActionPill';
import { PressScale } from '@/ui/press/PressScale';
import { Sticker } from '@/ui/sticker/Sticker';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { Hatch } from '@/ui/textures/hatch';
import { makeStyles, useTheme } from '@/ui/theme';

import { reactionA11y, reactionLabel } from './memory-copy';
import type { MemoryReactionChip } from './memory-model';

const KEN_BURNS_MS = 8000;
const KEN_BURNS_FROM = 1.08;
const GUIDE = 84;
const PHOTO_SHARE = 0.56;
const easeOut = bezierEasing(tokens.motion.easing.standard);

const useStyles = makeStyles((th) => ({
  photo: { width: '100%', overflow: 'hidden' },
  top: { position: 'absolute', start: th.size.gutter, end: th.size.gutter },
  guide: { position: 'absolute', end: th.size.gutter, bottom: th.space['24'] },
  body: { paddingHorizontal: th.size.gutter, gap: th.space['12'], marginTop: -th.space['32'] },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: th.space['6'],
    paddingStart: th.space['4'],
    paddingEnd: th.space['12'],
    paddingVertical: th.space['4'],
    borderRadius: th.radius.pill,
    backgroundColor: th.semantic.bg.raised,
  },
  face: {
    width: th.space['24'],
    height: th.space['24'],
    borderRadius: th.space['12'],
    alignItems: 'center',
    justifyContent: 'center',
  },
  add: { paddingStart: th.space['12'] },
  ctas: { paddingHorizontal: th.size.gutter, gap: th.space['12'], alignItems: 'center' },
}));

export interface MemoryViewProps {
  readonly title: string;
  readonly body: string;
  readonly eyebrow: string;
  /** A signed URL for the highlight photo; null draws the placeholder. */
  readonly photoUrl: string | null;
  readonly guideKind: string;
  readonly guideName: string;
  readonly reactions: readonly MemoryReactionChip[];
  readonly onClose: () => void;
  readonly onReact: () => void;
  /** Absent for a traveller who has left the crew. */
  readonly onReunion?: (() => void) | undefined;
  readonly reunionPending?: boolean;
  readonly onShare: () => void;
}

function Photo({ url, height }: { readonly url: string | null; readonly height: number }) {
  const theme = useTheme();
  const reduced = useReducedImpactMotion();
  const scale = useSharedValue(reduced ? 1 : KEN_BURNS_FROM);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!loaded || reduced) return;
    scale.value = withTiming(1, { duration: KEN_BURNS_MS, easing: easeOut });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a shared value's ref is stable.
  }, [loaded, reduced]);
  const drift = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const night = theme.semantic.bg.base;
  return (
    <View style={{ height }}>
      <Hatch baseColor={theme.color.ink['850']} />
      {url === null ? null : (
        <Animated.View style={[StyleSheet.absoluteFill, drift]}>
          <Image
            source={{ uri: url }}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
            onLoad={() => setLoaded(true)}
            accessibilityIgnoresInvertColors
          />
        </Animated.View>
      )}
      <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
        <Rect x={0} y={0} width={4000} height={height}>
          <LinearGradient
            start={vec(0, height * 0.45)}
            end={vec(0, height)}
            colors={[`${night}00`, night]}
          />
        </Rect>
      </Canvas>
    </View>
  );
}

/** The first letter, or a dot for a traveller whose account is gone. */
function initialOf(name: string): string {
  return isFormerMember(name) ? '·' : (Array.from(name.trim())[0] ?? '·');
}

function ReactionChip({ chip }: { readonly chip: MemoryReactionChip }) {
  const styles = useStyles();
  const theme = useTheme();
  const reduced = useReducedImpactMotion();
  return (
    <Animated.View
      entering={reduced ? FadeIn.duration(tokens.motion.duration.fast) : ZoomIn.springify()}
      style={styles.chip}
      accessible
      accessibilityLabel={reactionA11y(chip)}
      testID={`memory-reaction-${chip.key}`}
    >
      <View style={[styles.face, { backgroundColor: chip.colour ?? theme.color.ink['600'] }]}>
        <Text variant="label" color={theme.semantic.text.onAccent}>
          {initialOf(chip.name)}
        </Text>
      </View>
      <Text variant="label">{reactionLabel(chip)}</Text>
    </Animated.View>
  );
}

export function MemoryView(props: MemoryViewProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { t } = useLingui();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const bob = useLoop('bob');
  const photoHeight = Math.round(height * PHOTO_SHARE);

  return (
    <Scaffold edges={[]} testID="memory-screen">
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + theme.space['16'] }}>
        <View style={styles.photo}>
          <Photo url={props.photoUrl} height={photoHeight} />
          <Animated.View style={[styles.guide, bob]} pointerEvents="none">
            <Sticker
              kind={props.guideKind}
              name={props.guideName}
              size={GUIDE}
              variant="mask"
              maskColor={theme.color.ink['600']}
              pose="wave"
            />
          </Animated.View>
          <Row
            style={[styles.top, { top: insets.top + theme.space['8'] }]}
            justify="space-between"
            align="center"
          >
            <Tag label={props.eyebrow} color={theme.color.yellow} />
            <IconButton
              label={t({ id: 'recap.memory.close', message: 'Close' })}
              glyph={<Text variant="h3">✕</Text>}
              surface="onPhoto"
              onPress={props.onClose}
              testID="memory-close"
            />
          </Row>
        </View>
        <View style={styles.body}>
          <Text variant="h1" accessibilityRole="header" testID="memory-title">
            {props.title}
          </Text>
          <Text variant="bodyLg" color={theme.semantic.text.secondary} testID="memory-body">
            {props.body}
          </Text>
          <Row gap="8" wrap testID="memory-reactions">
            {props.reactions.map((chip) => (
              <ReactionChip key={chip.key} chip={chip} />
            ))}
            <PressScale
              onPress={props.onReact}
              accessibilityRole="button"
              accessibilityLabel={t({ id: 'recap.memory.react', message: 'React' })}
              testID="memory-react"
            >
              <View style={[styles.chip, styles.add]}>
                <Text variant="label">
                  {t({ id: 'recap.memory.reactChip', message: '+ React' })}
                </Text>
              </View>
            </PressScale>
          </Row>
        </View>
        <View style={[styles.ctas, { marginTop: theme.space['32'] }]}>
          {props.onReunion === undefined ? null : (
            <PillButton
              label={t({ id: 'recap.memory.reunion', message: 'Plan a reunion' })}
              tone="yellow"
              block
              loading={props.reunionPending === true}
              onPress={props.onReunion}
              testID="memory-reunion"
            />
          )}
          <TextLink
            label={t({ id: 'recap.memory.share', message: 'Share the memory' })}
            onPress={props.onShare}
            testID="memory-share"
          />
        </View>
      </ScrollView>
    </Scaffold>
  );
}
