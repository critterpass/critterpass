/**
 * A first-time example card (3.18): ring only, a tinted 40 tile, title and line, "EXAMPLE" in
 * the corner; stacked cards step back in opacity and scale.
 */
import { View } from 'react-native';

import { Text, makePremiumStyles, ring, usePremiumTheme } from '@/ui/premium';

import { HomeGlyph, type HomeGlyphName } from './home-glyph';

const STEPS = [
  { opacity: 0.7, scale: 1 },
  { opacity: 0.45, scale: 0.97 },
  { opacity: 0.25, scale: 0.94 },
] as const;

const useStyles = makePremiumStyles((t) => ({
  card: {
    height: 72,
    borderRadius: t.radius.card,
    paddingHorizontal: t.space.rowPadH,
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space.gap12,
    boxShadow: ring(1, t.color.fieldBorder, true),
  },
  tile: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  grow: { flex: 1 },
  example: { letterSpacing: 0.66, textTransform: 'uppercase' },
}));

export interface ExampleGhostCardProps {
  readonly step: 0 | 1 | 2;
  readonly glyph: HomeGlyphName;
  readonly tint: { readonly bg: string; readonly text: string };
  readonly title: string;
  readonly line: string;
  readonly exampleLabel: string;
}

export function ExampleGhostCard({
  step,
  glyph,
  tint,
  title,
  line,
  exampleLabel,
}: ExampleGhostCardProps) {
  const styles = useStyles();
  const t = usePremiumTheme();
  const look = STEPS[step];
  return (
    <View
      style={[styles.card, { opacity: look.opacity, transform: [{ scale: look.scale }] }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={[styles.tile, { backgroundColor: tint.bg }]}>
        <HomeGlyph name={glyph} size={20} color={tint.text} />
      </View>
      <View style={styles.grow}>
        <Text variant="rowTitle" numberOfLines={1}>
          {title}
        </Text>
        <Text variant="caption" tone="muted" numberOfLines={1}>
          {line}
        </Text>
      </View>
      <Text variant="tier" color={t.color.placeholder} style={styles.example}>
        {exampleLabel}
      </Text>
    </View>
  );
}
