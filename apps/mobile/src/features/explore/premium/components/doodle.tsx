/**
 * A hand-drawn doodle (the design's category and tile art) drawn from the shared doodle paths, in
 * the premium ink: strokes in the theme's ink, the wash in the given accent (or the doodle's own),
 * multiplied under the strokes as the design paints it. Decorative: the control holding it speaks.
 */
import { Canvas, Group, Path } from '@shopify/react-native-skia';
import { View } from 'react-native';

import { DOODLES, type DoodleName } from '@/ui/premium/icons/doodles/generated';
import { usePremiumTheme } from '@/ui/premium';

export type { DoodleName };

export interface DoodleProps {
  readonly name: DoodleName;
  /** Width in points; the height follows the doodle's aspect. */
  readonly size: number;
  /** The wash colour; defaults to the doodle's own accent, else the sun. */
  readonly accent?: string;
}

export function Doodle({ name, size, accent }: DoodleProps) {
  const t = usePremiumTheme();
  const def = DOODLES[name];
  const [vbWidth, vbHeight] = def.viewBox;
  const height = (size * vbHeight) / vbWidth;
  // The doodle paths name their paints by the shared token paths; premium draws them in its own.
  const paints: Readonly<Record<string, string>> = {
    ink: t.color.ink,
    'color.orange': t.accent.tangerine,
    'color.yellow': t.accent.sun,
  };
  const wash = accent ?? paints[def.defaultAccent ?? ''] ?? t.accent.sun;
  const paintOf = (paint: string): string => paints[paint] ?? wash;
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height }}
    >
      <Canvas style={{ width: size, height }}>
        <Group transform={[{ scale: size / vbWidth }]}>
          {def.layers.map((layer, index) => (
            <Path
              key={index}
              path={layer.d}
              color={paintOf(layer.paint)}
              opacity={layer.opacity ?? 1}
              {...(layer.multiply === true ? { blendMode: 'multiply' as const } : {})}
            />
          ))}
        </Group>
      </Canvas>
    </View>
  );
}
