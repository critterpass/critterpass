/**
 * Pieces of the boost sheet (9.12): the entry stamp card, the two option rows and the split fan.
 */
/* eslint-disable lingui/no-unlocalized-strings -- colour values, never copy. */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { useLocale } from '@/lib/i18n/use-locale';
import {
  Avatar,
  CritterSticker,
  PressableScale,
  REDUCED_FADE,
  SPRINGS,
  Tag,
  Text,
  usePremiumReducedMotion,
  usePremiumTheme,
} from '@/ui/premium';

import type { SeatedMember } from '../boost/boost-model';
import { seatColour } from './components/crew-colours';
import { PAPER } from './monetize-palette';
import { paperGrain } from './repeating-gradient';

export function EntryStampCard({
  place,
  until,
}: {
  readonly place: string;
  readonly until: string;
}) {
  const { t } = useLingui();
  const locale = useLocale();
  const th = usePremiumTheme();
  return (
    <View
      style={[
        styles.entry,
        {
          backgroundColor: th.accent.paper,
          boxShadow: `inset 0 0 0 3px ${th.accent.pink}, inset 0 0 0 7px ${th.accent.paper}, inset 0 0 0 8.5px ${th.accent.pink}, 0 18px 36px -16px rgba(176,48,107,0.45)`,
        },
      ]}
      accessible
      accessibilityLabel={`${place}. ${until}`}
    >
      <Text variant="mono" color={PAPER.stampInk} style={styles.entryHead}>
        {upper(t({ id: 'monetize.premium.entryHead', message: 'Trip boost · Entry' }), locale)}
      </Text>
      <Text
        variant="display"
        color={th.color.onAccent}
        numberOfLines={1}
        adjustsFontSizeToFit
        style={styles.entryPlace}
      >
        {place}
      </Text>
      <Text
        variant="noteAction"
        color={PAPER.stampInk}
        numberOfLines={2}
        // Beside the critter the date and its reason take two lines, as the stamp is set.
        singleLine={false}
        style={styles.entryUntil}
      >
        {until}
      </Text>
      <View style={styles.tanuki} pointerEvents="none">
        <CritterSticker kind="tanuki" name="Pon" size={110} pose="cheer" />
      </View>
    </View>
  );
}

export function OptionRow({
  title,
  detail,
  price,
  selected,
  tag,
  onPress,
  testID,
}: {
  readonly title: string;
  readonly detail: string;
  readonly price: string;
  readonly selected: boolean;
  readonly tag?: string;
  readonly onPress: () => void;
  readonly testID: string;
}) {
  const th = usePremiumTheme();
  return (
    <PressableScale
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${title}, ${detail}, ${price}`}
      testID={testID}
      style={[
        styles.option,
        {
          backgroundColor: th.color.card,
          boxShadow: selected ? `inset 0 0 0 2.5px ${th.color.ink}` : th.shadow.card,
        },
      ]}
    >
      <View
        style={[
          styles.radio,
          {
            boxShadow: selected
              ? `inset 0 0 0 6px ${th.color.ink}, inset 0 0 0 11px ${th.color.card}`
              : `inset 0 0 0 2px ${th.color.outlineEmpty}`,
            backgroundColor: selected ? th.color.ink : 'transparent',
          },
        ]}
      />
      <View style={styles.flex}>
        <Text variant="rowTitle" numberOfLines={1}>
          {title}
        </Text>
        <Text variant="caption" tone="muted" numberOfLines={2}>
          {detail}
        </Text>
      </View>
      <Text variant="title" style={styles.heavy}>
        {price}
      </Text>
      {tag === undefined ? null : (
        <View style={styles.optionTag}>
          <Tag label={tag} rotate={-4} />
        </View>
      )}
    </PressableScale>
  );
}

const ARC_Y = [6, 0, -4, -4, 0, 6];

function FanSeat({
  member,
  index,
  count,
  split,
  share,
}: {
  readonly member: SeatedMember;
  readonly index: number;
  readonly count: number;
  readonly split: boolean;
  readonly share: string | null;
}) {
  const th = usePremiumTheme();
  const reduced = usePremiumReducedMotion();
  const fan = useSharedValue(split ? 1 : 0);
  useEffect(() => {
    const to = split ? 1 : 0;
    fan.set(
      reduced
        ? withTiming(to, REDUCED_FADE)
        : withDelay(index * 40, withSpring(to, SPRINGS.snappy)),
    );
  }, [split, reduced, index, fan]);
  const mid = (count - 1) / 2;
  const style = useAnimatedStyle(() => ({
    transform: [
      { translateY: (ARC_Y[index % ARC_Y.length] ?? 0) * fan.value },
      { rotate: `${String(((index - mid) / Math.max(1, mid)) * 8 * fan.value)}deg` },
    ],
  }));
  return (
    <Animated.View style={[styles.seat, style]}>
      <Avatar name={member.name} color={seatColour(th, index)} uid={member.uid} size={40} />
      {split && share !== null ? (
        <Text variant="badge" style={styles.heavy}>
          {share}
        </Text>
      ) : null}
    </Animated.View>
  );
}

export function SplitFan({
  seated,
  split,
  share,
}: {
  readonly seated: readonly SeatedMember[];
  readonly split: boolean;
  readonly share: string | null;
}) {
  return (
    <View style={styles.fan} testID="boost-split-fan">
      {seated.slice(0, 8).map((member, i) => (
        <FanSeat
          key={member.uid}
          member={member}
          index={i}
          count={Math.min(8, seated.length)}
          split={split}
          share={share}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  heavy: { fontWeight: '800' },
  entry: {
    height: 148,
    borderRadius: 20,
    padding: 16,
    experimental_backgroundImage: paperGrain(),
    transform: [{ rotate: '-1.5deg' }],
    marginTop: 8,
  },
  entryHead: { letterSpacing: 1.6 },
  entryPlace: { maxWidth: '70%' },
  entryUntil: { maxWidth: '62%' },
  tanuki: { position: 'absolute', right: -10, bottom: -18, transform: [{ rotate: '8deg' }] },
  option: {
    minHeight: 62,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  radio: { width: 22, height: 22, borderRadius: 11 },
  optionTag: { position: 'absolute', right: 12, top: -12 },
  fan: { flexDirection: 'row', justifyContent: 'center', gap: 6, paddingVertical: 10 },
  seat: { alignItems: 'center', gap: 4 },
});
