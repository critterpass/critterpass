/**
 * Small pieces the crew pages share: a radio row (one choice in a list), the crew code as split-flap tiles, and a round share target.
 */
/* eslint-disable lingui/no-unlocalized-strings -- style values, never copy. */
import { t } from '@lingui/core/macro';
import { StyleSheet, View } from 'react-native';

import { premium } from '@cp/design-tokens';

import {
  Avatar,
  Icon,
  PressableScale,
  Text,
  usePremiumTheme,
  type PremiumIconName,
} from '@/ui/premium';

/** A person to pick: avatar, name, reason, and the radio (ink dot when picked). */
export function RadioRow({
  name,
  color,
  line,
  selected,
  quiet = false,
  onPress,
  testID,
}: {
  readonly name: string;
  readonly color: string;
  readonly line?: string;
  readonly selected: boolean;
  readonly quiet?: boolean;
  readonly onPress: () => void;
  readonly testID?: string;
}) {
  const th = usePremiumTheme();
  return (
    <PressableScale
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={name}
      onPress={onPress}
      pressedScale={0.99}
      testID={testID}
      style={[styles.radioRow, { paddingHorizontal: th.space.rowPadH }, quiet && { opacity: 0.55 }]}
    >
      <Avatar name={name} color={color} size={36} />
      <View style={styles.grow}>
        <Text variant="rowTitle">{name}</Text>
        {line === undefined ? null : (
          <Text variant="caption" tone="muted">
            {line}
          </Text>
        )}
      </View>
      <View
        style={[
          styles.radio,
          selected
            ? {
                boxShadow: `inset 0 0 0 6px ${th.color.ink}, inset 0 0 0 11px ${th.color.card}`,
                backgroundColor: th.color.ink,
              }
            : { borderWidth: 2, borderColor: th.color.outlineEmpty },
        ]}
      />
    </PressableScale>
  );
}

/** Flaps stay dark in both modes (the board is art, like a boarding pass). */
const FLAP = premium.modes.light.color;

/** The crew code as six split-flap tiles (dark halves, a hairline seam). */
export function SplitFlapCode({
  code,
  testID,
}: {
  readonly code: string | null;
  readonly testID?: string;
}) {
  const letters = Array.from((code ?? '······').slice(0, 6));
  return (
    <View
      style={styles.flaps}
      accessible
      accessibilityLabel={code ?? t({ id: 'crew.premium.codeComing', message: 'Code on its way' })}
      testID={testID}
    >
      {letters.map((letter, i) => (
        <View key={`${String(i)}-${letter}`} style={styles.flap}>
          <View style={[styles.half, styles.top, { backgroundColor: FLAP.inkPressed }]} />
          <View style={[styles.half, styles.bottom, { backgroundColor: FLAP.ink }]} />
          <View style={[styles.seam, { backgroundColor: FLAP.inkFillBottom }]} />
          <Text variant="stat" color={FLAP.onInk}>
            {letter}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** A 60 round share target with its label under it. */
export function ShareTarget({
  label,
  icon,
  tint,
  onPress,
  testID,
}: {
  readonly label: string;
  readonly icon: PremiumIconName;
  readonly tint?: string;
  readonly onPress: () => void;
  readonly testID?: string;
}) {
  const th = usePremiumTheme();
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      testID={testID}
      style={styles.target}
    >
      <View
        style={[
          styles.targetDisc,
          { backgroundColor: tint ?? th.color.card, boxShadow: th.shadow.raised },
        ]}
      >
        <Icon
          name={icon}
          size={24}
          color={tint === undefined ? th.color.ink : th.accent.stickerEdge}
        />
      </View>
      <Text variant="caption" tone="inkSecondary" numberOfLines={1}>
        {label}
      </Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  grow: { flex: 1 },
  radioRow: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12 },
  radio: { width: 22, height: 22, borderRadius: 11 },
  flaps: { flexDirection: 'row', gap: 6 },
  flap: {
    flex: 1,
    height: 58,
    borderRadius: 12,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  half: { position: 'absolute', left: 0, right: 0, height: '50%' },
  top: { top: 0 },
  bottom: { bottom: 0 },
  seam: { position: 'absolute', left: 0, right: 0, top: '50%', height: 1, opacity: 0.5 },
  target: { alignItems: 'center', gap: 6, width: 68 },
  targetDisc: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
