/**
 * The Pass+ visa page (9.10, 9.15): paper with a faint pink dot pattern, the mono header, "Pass+",
 * the store's price, a 2×2 of fields, the MRZ line and the Stamp icon in its holo ring, tilted −2°,
 * with a shine passing over it. Paper stays light in dark mode (it is paper).
 */
/* eslint-disable lingui/no-unlocalized-strings -- colour values, never copy. */
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text, usePremiumTheme } from '@/ui/premium';

import { PAPER } from '../monetize-palette';

import { ShineSweep } from './shine-sweep';
import { StampIcon } from './stamp-icon';

const PAPER_MUTED = PAPER.muted;

export interface VisaCardProps {
  /** "Pass+". */
  readonly title: string;
  readonly header: string;
  readonly page: string;
  readonly price: string | null;
  readonly priceNote: string | null;
  readonly fields: readonly (readonly [label: string, value: string])[];
  readonly mrz: string;
  readonly height: number;
  readonly iconLabel: string;
  /** A stamp or sticker laid on the page. */
  readonly children?: ReactNode;
  readonly accessibilityLabel: string;
  readonly testID?: string;
}

export function VisaCard({
  title,
  header,
  page,
  price,
  priceNote,
  fields,
  mrz,
  height,
  iconLabel,
  children,
  accessibilityLabel,
  testID,
}: VisaCardProps) {
  const t = usePremiumTheme();
  const PAPER_INK = t.color.onAccent;
  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel={accessibilityLabel}
      style={[styles.card, { height, backgroundColor: t.accent.paper }]}
    >
      <View style={styles.clip}>
        <ShineSweep every={5200} width={110} distance={440} />
      </View>
      <View style={styles.headerRow}>
        <Text variant="mono" color={PAPER_MUTED} numberOfLines={1} style={styles.flex}>
          {header}
        </Text>
        <Text variant="mono" color={PAPER_MUTED}>
          {page}
        </Text>
      </View>
      <Text variant="hero" color={PAPER_INK} style={styles.brand}>
        {title}
      </Text>
      {price === null ? null : (
        <View style={styles.priceRow}>
          <Text variant="title" color={PAPER_INK} style={styles.heavy}>
            {price}
          </Text>
          {priceNote === null ? null : (
            <Text variant="caption" color={PAPER_MUTED}>
              {priceNote}
            </Text>
          )}
        </View>
      )}
      <View style={styles.grid}>
        {fields.map(([label, value]) => (
          <View key={label} style={styles.field}>
            <Text variant="badge" color={PAPER_MUTED} style={styles.fieldLabel} numberOfLines={1}>
              {label}
            </Text>
            <Text variant="rowTextStrong" color={PAPER_INK} numberOfLines={1}>
              {value}
            </Text>
          </View>
        ))}
      </View>
      <Text
        variant="mono"
        color={PAPER_MUTED}
        numberOfLines={1}
        ellipsizeMode="clip"
        style={styles.mrz}
      >
        {mrz}
      </Text>
      <View style={styles.icon} pointerEvents="none">
        <StampIcon size={96} holo label={iconLabel} />
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    padding: 18,
    experimental_backgroundImage:
      'radial-gradient(circle at 1px 1px, rgba(255,95,168,0.07) 1px, transparent 1.5px)',
    boxShadow: '0 2px 4px rgba(0,0,0,0.2), 0 30px 60px -20px rgba(0,0,0,0.6)',
    transform: [{ rotate: '-2deg' }],
  },
  clip: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: 24,
    overflow: 'hidden',
  },
  headerRow: { flexDirection: 'row', gap: 8 },
  flex: { flex: 1 },
  brand: { marginTop: 4 },
  heavy: { fontWeight: '800' },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', width: 196, marginTop: 12, rowGap: 8 },
  field: { width: 98 },
  fieldLabel: { letterSpacing: 0.9, fontWeight: '700' },
  mrz: { position: 'absolute', left: 18, right: 18, bottom: 14 },
  icon: { position: 'absolute', right: 14, top: 64 },
});
