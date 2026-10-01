/**
 * The hatch (3l-1): on landing the trip's egg wobbles, cracks and pops; confetti fires at the
 * crack and the critter lands with a squash and stretch. It plays once. Under Reduce Motion the egg cross-fades to the critter, keeping the haptic and SFX.
 */
import type { FormSpec } from '@cp/critter-art';
import { upper } from '@cp/i18n';
import { Group, RadialGradient, Rect, vec } from '@shopify/react-native-skia';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useWindowDimensions, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { useLocale } from '@/lib/i18n/use-locale';
import { deviceTier, impact, patterns } from '@/motion';
import { useReducedImpactMotion } from '@/motion/patterns/shared';
import { PillButton } from '@/ui/buttons/PillButton';
import { TextLink } from '@/ui/buttons/TextLink';
import { Egg, type EggState } from '@/ui/critters/Egg';
import { Stack } from '@/ui/layout/Stack';
import { Sticker } from '@/ui/sticker/Sticker';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { TextureCanvas } from '@/ui/textures/TextureCanvas';
import { makeStyles, useTheme } from '@/ui/theme';

import {
  hatchedBody,
  hatchedTitle,
  landedEyebrow,
  later,
  pendingNote,
  sayHi,
  welcome,
} from './hatch-copy';
import { artKind } from '../art-kind';

/** Beats of the choreography (ms from mount): wobble, crack, pop. */
export const HATCH_BEATS = { crack: 900, pop: 1250, reveal: 1650 } as const;

/** The render's egg: about a third of the screen's width with its sticker edge. */
const EGG_SIZE = 120;
/** The soft glow behind the egg, in its spots' colour, fading into the page. */
const GLOW_OPACITY = 0.22;
const GLOW_RADIUS = EGG_SIZE * 1.6;
const CRITTER_SIZE = 150;

export interface HatchViewProps {
  readonly place: string;
  /** Local landing time ("13:50"), or null when it hatched on arrival or by hand. */
  readonly landedTime: string | null;
  /** The airport the landing leg arrived at ("DPS"), when there is a flight. */
  readonly landedAirport: string | null;
  readonly colour: string | null;
  readonly critterKey: string | null;
  readonly seed: number;
  readonly form: FormSpec | null;
  /** Only from the viewer's own verified entry, or the guide's public name. */
  readonly name: string | null;
  readonly isGuide: boolean;
  readonly days: number | null;
  readonly no: number | null;
  readonly setName: string;
  /** Queued offline: the entry joins the pass once the hatch reaches the server. */
  readonly pending: boolean;
  readonly onSayHi: (() => void) | null;
  readonly onLater: () => void;
  /** Fires once when the critter is revealed (the screen marks the ceremony seen). */
  readonly onRevealed?: () => void;
  /** Holds the ceremony on one egg beat instead of playing it (the lab's still frames). */
  readonly stillAt?: 'wobbling' | 'cracking';
}

const useStyles = makeStyles((th) => ({
  body: { flex: 1, paddingHorizontal: th.size.gutter, justifyContent: 'space-between' },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  footer: { gap: th.space['12'], alignItems: 'center', paddingBottom: th.space['16'] },
}));

export function HatchView(props: HatchViewProps) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const reduced = useReducedImpactMotion();
  const { width, height } = useWindowDimensions();
  const [egg, setEgg] = useState<EggState>(props.stillAt ?? (reduced ? 'hatched' : 'wobbling'));
  const [revealed, setRevealed] = useState(
    props.stillAt === undefined ? reduced : props.stillAt === 'cracking',
  );
  const shown = useSharedValue(revealed ? 1 : 0);
  useEffect(() => {
    if (revealed) shown.value = withTiming(1, { duration: theme.motion.duration.fast });
  }, [revealed, shown, theme.motion.duration.fast]);
  const reveal = useAnimatedStyle(() => ({ opacity: shown.value }));
  const onRevealed = useRef(props.onRevealed);
  useLayoutEffect(() => {
    onRevealed.current = props.onRevealed;
  });

  const still = props.stillAt !== undefined;
  useEffect(() => {
    if (still) return undefined;
    if (reduced) {
      impact('pop');
      onRevealed.current?.();
      return undefined;
    }
    const timers = [
      setTimeout(() => {
        setEgg('cracking');
        impact('crack');
        patterns.triggerConfetti(width / 2, height * 0.42, 'medium', deviceTier);
      }, HATCH_BEATS.crack),
      setTimeout(() => {
        setEgg('hatched');
        impact('pop');
      }, HATCH_BEATS.pop),
      setTimeout(() => {
        setRevealed(true);
        impact('chirp');
        onRevealed.current?.();
      }, HATCH_BEATS.reveal),
    ];
    return () => timers.forEach(clearTimeout);
    // The choreography runs once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hatchling =
    props.critterKey === null ? undefined : (
      <Sticker
        kind={artKind(props.critterKey)}
        name={props.name ?? ''}
        size={CRITTER_SIZE}
        seed={props.seed}
        {...(props.form === null ? {} : { form: props.form })}
      />
    );
  return (
    <Scaffold variant="dark" edges={['top', 'bottom']} testID="critters-hatch">
      <View style={styles.body}>
        <Stack gap="6" align="center" style={{ paddingTop: theme.space['16'] }}>
          <Text variant="eyebrow" color={theme.semantic.action.primary}>
            {upper(landedEyebrow(props.landedTime, props.landedAirport), locale)}
          </Text>
          <Text variant="displayXl" style={{ textAlign: 'center' }} singleLine={false}>
            {upper(welcome(props.place), locale)}
          </Text>
        </Stack>
        <View style={styles.stage}>
          <TextureCanvas>
            {({ width: w, height: h }) => (
              <Group opacity={GLOW_OPACITY}>
                <Rect x={0} y={0} width={w} height={h}>
                  <RadialGradient
                    c={vec(w / 2, h / 2)}
                    r={GLOW_RADIUS}
                    colors={[props.colour ?? theme.semantic.action.primary, 'transparent']}
                  />
                </Rect>
              </Group>
            )}
          </TextureCanvas>
          <Egg
            state={egg}
            size={EGG_SIZE}
            {...(props.colour === null ? {} : { color: props.colour })}
            {...(hatchling === undefined ? {} : { hatchling })}
            {...(props.name === null ? {} : { hatchlingName: props.name })}
            testID={`critters-hatch-egg-${egg}`}
          />
        </View>
        <View style={styles.footer}>
          {revealed ? (
            <Animated.View style={reveal}>
              <Stack gap="8" align="center">
                <Text variant="h2" color={theme.semantic.action.primary} testID="critters-hatched">
                  {upper(hatchedTitle(props.name), locale)}
                </Text>
                <Text
                  variant="body"
                  color={theme.semantic.text.secondary}
                  style={{ textAlign: 'center' }}
                >
                  {hatchedBody({
                    isGuide: props.isGuide,
                    days: props.days,
                    no: props.no,
                    place: props.setName,
                  })}
                </Text>
                {props.pending ? (
                  <Text
                    variant="caption"
                    color={theme.semantic.text.secondary}
                    testID="critters-hatch-pending"
                  >
                    {pendingNote()}
                  </Text>
                ) : null}
              </Stack>
            </Animated.View>
          ) : null}
          {props.onSayHi === null ? null : (
            <PillButton
              label={sayHi()}
              onPress={props.onSayHi}
              block
              testID="critters-hatch-say-hi"
            />
          )}
          <TextLink label={later()} onPress={props.onLater} testID="critters-hatch-later" />
        </View>
      </View>
    </Scaffold>
  );
}
