/**
 * The Pass+ gold call to action (9.10, 9.11, 9.15): 56 high, a warm gradient with a lit top edge
 * and a slow shine. Loading keeps the pill and shows the progressive verb. Disabled it takes the
 * kit's disabled fill (1.B: #e9eaee) with a clear edge and dark grey words, since the fill alone is
 * a shade off the ground and the pill vanished into it; never a dimmed gold that reads as broken; on
 * the night ground (`onNight`) it is the night's glass with soft white words, the same in light and
 * dark, since that ground never changes with the appearance.
 */
/* eslint-disable lingui/no-unlocalized-strings -- colour values, never copy. */
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { PressableScale, Spinner, Text, usePremiumTheme } from '@/ui/premium';

import { NIGHT } from '../monetize-palette';

import { ShineSweep } from './shine-sweep';

export interface GoldButtonProps {
  readonly label: string;
  readonly onPress: () => void;
  readonly disabled?: boolean;
  readonly loading?: boolean;
  /** Something to the left of the label (the Stamp icon on 9.15). */
  readonly leading?: ReactNode;
  /** Drawn on the paywall's night ground. */
  readonly onNight?: boolean;
  readonly testID?: string;
}

export function GoldButton({
  label,
  onPress,
  disabled = false,
  loading = false,
  leading,
  onNight = false,
  testID,
}: GoldButtonProps) {
  const t = usePremiumTheme();
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      {...(testID === undefined ? {} : { testID })}
      style={[
        disabled
          ? [
              styles.shape,
              onNight
                ? { backgroundColor: NIGHT_DISABLED_FILL, boxShadow: NIGHT_DISABLED_RING }
                : {
                    backgroundColor: t.color.controlDisabled,
                    boxShadow: `0 0 0 1px ${t.color.outlineEmpty}`,
                  },
            ]
          : styles.pill,
        { height: t.size.button, borderRadius: t.radius.button },
      ]}
    >
      {disabled ? null : <ShineSweep every={4200} width={80} distance={420} opacity={0.45} />}
      <View style={styles.row}>
        {loading ? <Spinner /> : leading}
        <Text
          variant="button"
          // Off, the label still reads (the fill says it is off): white on the night, grey ink by day.
          color={disabled ? (onNight ? NIGHT.text : t.color.inkSecondary) : t.color.onAccent}
          style={styles.label}
          numberOfLines={1}
        >
          {label}
        </Text>
      </View>
    </PressableScale>
  );
}

// Disabled on the night still reads: soft white words on a lighter glass with a clear edge.
// eslint-disable-next-line critterpass/no-literal-style -- the night's glass, pending a token
const NIGHT_DISABLED_FILL = 'rgba(255,255,255,0.12)';
const NIGHT_DISABLED_RING = '0 0 0 1px rgba(255,255,255,0.24)';

const styles = StyleSheet.create({
  shape: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  pill: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    experimental_backgroundImage: 'linear-gradient(180deg, #ffe78f, #ffd84a 48%, #f0b72c)',
    boxShadow:
      'inset 0 1px 0 rgba(255,255,255,0.75), inset 0 -2px 0 rgba(160,100,0,0.22), 0 0 0 0.5px rgba(160,100,0,0.3), 0 18px 34px -12px rgba(240,180,30,0.6)',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20 },
  label: { fontWeight: '700' },
});
