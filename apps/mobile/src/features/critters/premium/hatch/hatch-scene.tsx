/**
 * Egg hatch (8.05): mint rays turning and confetti from the egg, the landing chip, the two egg
 * halves tipped apart and the new critter hopping between them, then "TOKEK HATCHED", the welcome,
 * the set tag, Say hi (the guide chat) and Show me around later. Reduce Motion skips straight to
 * the reveal. The ceremony has no ✕: its two choices are its ways out.
 */
import { t } from '@lingui/core/macro';
import { Stack } from 'expo-router';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLocale } from '@/lib/i18n/use-locale';
import {
  Button,
  CritterSticker,
  Tag,
  Text,
  TextButton,
  usePremiumReducedMotion,
  usePremiumTheme,
  riseIn,
} from '@/ui/premium';

import { artKind } from '../../art-kind';
import {
  hatchedBody,
  hatchedTitle,
  landedEyebrow,
  later,
  pendingNote,
  sayHi,
  welcome,
} from '../../hatch/hatch-copy';
import type { HatchViewProps } from '../../hatch/hatch-model';
import { Confetti, Rays } from '../components/celebration';
import { Hop } from '../components/loops';
import { HATCH_PAINT } from '../components/scrims';

/** When the halves part and the critter is shown (the egg's crack). */
const REVEAL_MS = 900;

function EggHalf({
  size,
  tilt,
  top,
}: {
  readonly size: number;
  readonly tilt: number;
  readonly top: boolean;
}) {
  return (
    <View
      style={{
        width: size,
        height: size * 0.62,
        backgroundColor: HATCH_PAINT.shell,
        borderTopLeftRadius: top ? size / 2 : size * 0.12,
        borderTopRightRadius: top ? size / 2 : size * 0.12,
        borderBottomLeftRadius: top ? size * 0.12 : size / 2,
        borderBottomRightRadius: top ? size * 0.12 : size / 2,
        transform: [{ rotate: `${tilt}deg` }],
      }}
    />
  );
}

export function PremiumHatchScene(props: HatchViewProps) {
  const th = usePremiumTheme();
  const insets = useSafeAreaInsets();
  const locale = useLocale();
  const reduced = usePremiumReducedMotion();
  const [revealed, setRevealed] = useState(reduced || props.stillAt === 'cracking');
  const onRevealed = useRef(props.onRevealed);
  useLayoutEffect(() => {
    onRevealed.current = props.onRevealed;
  });
  useEffect(() => {
    if (props.stillAt !== undefined) return undefined;
    if (reduced) {
      onRevealed.current?.();
      return undefined;
    }
    const timer = setTimeout(() => {
      setRevealed(true);
      onRevealed.current?.();
    }, REVEAL_MS);
    return () => clearTimeout(timer);
    // The ceremony runs once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const entering = (delay: number) => riseIn(reduced, 'smooth', delay);
  const name = props.name ?? '';
  const tag =
    props.no === null
      ? null
      : t({
          id: 'critters.premium.hatch.setTag',
          message: `#${props.no} in the ${props.setName} set`,
        });
  return (
    <View style={[styles.fill, { backgroundColor: th.color.ground }]} testID="critters-hatch">
      <Stack.Screen options={{ headerShown: false, gestureEnabled: false }} />
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Rays color={HATCH_PAINT.rays} ms={26_000} centerY={insets.top + 260} />
        {revealed && !reduced ? <Confetti count={40} fx={0.5} fy={0.36} /> : null}
      </View>
      <View style={[styles.column, { paddingTop: insets.top + 12 }]}>
        <View style={[styles.chip, { backgroundColor: th.color.ink }]}>
          <Text variant="badge" tone="onInk">
            {landedEyebrow(props.landedTime, props.landedAirport)}
          </Text>
        </View>
        <View style={styles.stage}>
          <View style={[styles.half, { left: 34, top: 150 }]}>
            <EggHalf size={86} tilt={revealed ? -24 : -4} top />
          </View>
          <View style={[styles.half, { right: 34, top: 168 }]}>
            <EggHalf size={78} tilt={revealed ? 28 : 4} top={false} />
          </View>
          {revealed && props.critterKey !== null ? (
            <Hop ms={2400}>
              <CritterSticker
                kind={artKind(props.critterKey)}
                name={name}
                size={210}
                seed={props.seed}
                pose="wave"
                {...(props.form === null ? {} : { form: props.form })}
              />
            </Hop>
          ) : null}
        </View>
        {revealed ? (
          <Animated.View entering={entering(0)} style={styles.words}>
            <Text
              variant="tier"
              color={th.color.status.booked.text}
              align="center"
              testID="critters-hatched"
            >
              {hatchedTitle(props.name).toLocaleUpperCase(locale)}
            </Text>
            <Text variant="displayLarge" align="center" numberOfLines={2}>
              {welcome(props.place)}
            </Text>
            <Text variant="body" tone="inkSecondary" align="center">
              {hatchedBody({
                isGuide: props.isGuide,
                days: props.days,
                no: props.no,
                place: props.setName,
              })}
            </Text>
            {tag === null ? null : <Tag label={tag} color={th.accent.sun} rotate={-4} />}
            {props.pending ? (
              <Text variant="captionMuted" tone="muted" testID="critters-hatch-pending">
                {pendingNote()}
              </Text>
            ) : null}
          </Animated.View>
        ) : null}
      </View>
      <View style={[styles.foot, { paddingBottom: insets.bottom + 16 }]}>
        {props.onSayHi === null ? null : (
          <Button label={sayHi()} onPress={props.onSayHi} testID="critters-hatch-say-hi" />
        )}
        <TextButton
          align="center"
          label={later()}
          onPress={props.onLater}
          testID="critters-hatch-later"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  column: { flex: 1, alignItems: 'center', paddingHorizontal: 24 },
  chip: { height: 30, paddingHorizontal: 12, borderRadius: 15, justifyContent: 'center' },
  stage: { width: '100%', height: 280, alignItems: 'center', justifyContent: 'flex-end' },
  half: { position: 'absolute' },
  words: { alignItems: 'center', gap: 8, marginTop: 8 },
  foot: { paddingHorizontal: 20, gap: 10, alignItems: 'stretch' },
});
