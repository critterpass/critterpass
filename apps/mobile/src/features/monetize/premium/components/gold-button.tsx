/**
 * The Pass+ gold call to action (9.10, 9.11, 9.15): 56 high, a warm gradient with a lit top edge
 * and a slow shine. Loading keeps the pill and shows the progressive verb.
 */
/* eslint-disable lingui/no-unlocalized-strings -- colour values, never copy. */
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { PressableScale, Spinner, Text, usePremiumTheme } from '@/ui/premium';

import { ShineSweep } from './shine-sweep';

export interface GoldButtonProps {
  readonly label: string;
  readonly onPress: () => void;
  readonly disabled?: boolean;
  readonly loading?: boolean;
  /** Something to the left of the label (the Stamp icon on 9.15). */
  readonly leading?: ReactNode;
  readonly testID?: string;
}

export function GoldButton({
  label,
  onPress,
  disabled = false,
  loading = false,
  leading,
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
        styles.pill,
        { height: t.size.button, borderRadius: t.radius.button, opacity: disabled ? 0.5 : 1 },
      ]}
    >
      <ShineSweep every={4200} width={80} distance={420} opacity={0.45} />
      <View style={styles.row}>
        {loading ? <Spinner /> : leading}
        <Text variant="button" color={t.color.onAccent} style={styles.label} numberOfLines={1}>
          {label}
        </Text>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
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
