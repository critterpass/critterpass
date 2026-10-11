import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GlassPill, PremiumThemeProvider, Text, usePremiumTheme } from '@/ui/premium';
import { FullScreen } from '@/ui/premium/shell';

export const __CP_DEV_ROUTE__ = true;

const STUB = [
  { key: 'gate', label: 'GATE', value: '14' },
  { key: 'boards', label: 'BOARDS', value: '09:05' },
  { key: 'seat', label: 'SEAT', value: '32A' },
  { key: 'zone', label: 'ZONE', value: '3' },
] as const;

const CODE_CELLS = 21;

/** A fixed, code-like pattern: three finder squares and a scatter that reads as a scannable code. */
function codeCell(row: number, col: number): boolean {
  const finder = (r: number, c: number) => {
    const ring = Math.max(Math.abs(r - 3), Math.abs(c - 3));
    return ring !== 2 && ring <= 3;
  };
  if (row < 7 && col < 7) return finder(row, col);
  if (row < 7 && col >= CODE_CELLS - 7) return finder(row, col - (CODE_CELLS - 7));
  if (row >= CODE_CELLS - 7 && col < 7) return finder(row - (CODE_CELLS - 7), col);
  if (row === 7 || col === 7 || row === CODE_CELLS - 8 || col === CODE_CELLS - 8) return false;
  return (row * 7 + col * 13 + ((row * col) % 5)) % 3 === 0;
}

function DemoCode({ size }: { readonly size: number }) {
  const th = usePremiumTheme();
  const cell = size / CODE_CELLS;
  return (
    <View style={{ width: size, height: size }} accessibilityLabel="Boarding pass code">
      {Array.from({ length: CODE_CELLS }, (_, row) => (
        <View key={row} style={styles.codeRow}>
          {Array.from({ length: CODE_CELLS }, (__, col) => (
            <View
              key={col}
              style={{
                width: cell,
                height: cell,
                backgroundColor: codeCell(row, col) ? th.color.ink : 'transparent',
              }}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

function DemoPass() {
  const th = usePremiumTheme();
  return (
    <View
      style={[
        styles.card,
        {
          borderRadius: th.radius.hero,
          backgroundColor: th.color.card,
          boxShadow: th.shadow.photo,
        },
      ]}
    >
      <View style={[styles.band, { backgroundColor: th.color.inkSurface }]}>
        <View style={[styles.carrier, { backgroundColor: th.accent.sun }]}>
          <Text variant="badge" color={th.color.onAccent} style={styles.heavy}>
            SQ
          </Text>
        </View>
        <View style={styles.flex}>
          <Text variant="rowTitle" color={th.accent.paper}>
            SQ 943
          </Text>
          <Text variant="label" color={th.accent.paper} style={styles.soft}>
            Singapore Airlines · Economy · Tue 14 Oct
          </Text>
        </View>
      </View>
      <View style={styles.route}>
        <View>
          <Text variant="display">DPS</Text>
          <Text variant="caption" tone="muted">
            Denpasar · 09:45
          </Text>
        </View>
        <Text variant="title" tone="placeholder" accessibilityElementsHidden>
          ✈︎
        </Text>
        <View style={styles.end}>
          <Text variant="display">SIN</Text>
          <Text variant="caption" tone="muted">
            Singapore · 12:20
          </Text>
        </View>
      </View>
      <View style={styles.stub}>
        {STUB.map((field) => (
          <View key={field.key} style={styles.flex}>
            <Text variant="badge" tone="placeholder" style={styles.caps}>
              {field.label}
            </Text>
            <Text variant="navTitle">{field.value}</Text>
          </View>
        ))}
      </View>
      <View style={[styles.divider, { borderColor: th.color.fieldBorder }]} />
      <View style={styles.codeWrap}>
        <DemoCode size={210} />
        <Text variant="mono" tone="muted">
          K7Q2XM
        </Text>
      </View>
      <View style={[styles.passenger, { borderColor: th.color.fieldBorder }]}>
        <View>
          <Text variant="badge" tone="placeholder" style={styles.caps}>
            PASSENGER
          </Text>
          <Text variant="rowTitle">MAYA NGUYEN</Text>
        </View>
        <View style={styles.end}>
          <Text variant="badge" tone="placeholder" style={styles.caps}>
            SEQ
          </Text>
          <Text variant="rowTitle">041</Text>
        </View>
      </View>
    </View>
  );
}

/** The boarding pass on the dark page around it. */
function DarkPage() {
  const th = usePremiumTheme();
  const insets = useSafeAreaInsets();
  return (
    <FullScreen closeLabel="Close" brighten testID="premium-shell-full">
      <View style={[styles.root, { backgroundColor: th.color.ground }]}>
        <View style={[styles.top, { top: insets.top + th.space.gap6 }]}>
          <GlassPill kind="clear" label="Brightness up" />
        </View>
        <ScrollView
          contentContainerStyle={{
            paddingTop: insets.top + 70,
            paddingBottom: insets.bottom + 40,
            paddingHorizontal: th.space.gutter,
            gap: 20,
          }}
        >
          <PremiumThemeProvider scheme="light">
            <DemoPass />
          </PremiumThemeProvider>
          <Text variant="label" align="center" color={th.accent.paper} style={styles.soft}>
            Saved on this phone · works offline
          </Text>
        </ScrollView>
      </View>
    </FullScreen>
  );
}

/** The full-screen type: one job, ✕ top-left on clear glass, the window at full brightness. */
export default function DemoFull() {
  return (
    <PremiumThemeProvider scheme="dark">
      <DarkPage />
    </PremiumThemeProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  top: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 1 },
  card: { overflow: 'hidden' },
  band: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 18,
    paddingHorizontal: 20,
  },
  carrier: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heavy: { fontWeight: '800' },
  soft: { opacity: 0.8 },
  flex: { flex: 1 },
  route: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  end: { alignItems: 'flex-end' },
  stub: { flexDirection: 'row', paddingHorizontal: 20, paddingBottom: 14, gap: 6 },
  caps: { letterSpacing: 0.8 },
  divider: { borderTopWidth: 1.5, borderStyle: 'dashed', marginHorizontal: 20 },
  codeWrap: { alignItems: 'center', gap: 10, paddingTop: 22, paddingBottom: 18 },
  codeRow: { flexDirection: 'row' },
  passenger: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
});
