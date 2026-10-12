/**
 * The magnifier the Find field leads with (17 pt, stroke 2.4 in the design). The kit's line icons
 * have no search glyph yet; it is drawn the same way (24 grid, round caps) so it can move there.
 */
import { Canvas, Group, Path } from '@shopify/react-native-skia';
import { View } from 'react-native';

import { usePremiumTheme } from '@/ui/premium';

/* eslint-disable-next-line lingui/no-unlocalized-strings -- SVG path data, never copy. */
const MAGNIFIER = 'M10.5 4a6.5 6.5 0 1 0 0 13a6.5 6.5 0 1 0 0-13zM15.5 15.5L20 20';
const GRID = 24;
const STROKE = 2.4;

export function SearchGlyph({ size, color }: { readonly size: number; readonly color?: string }) {
  const t = usePremiumTheme();
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size }}
    >
      <Canvas style={{ width: size, height: size }}>
        <Group transform={[{ scale: size / GRID }]}>
          <Path
            path={MAGNIFIER}
            color={color ?? t.color.ink}
            style="stroke"
            strokeWidth={STROKE}
            strokeCap="round"
            strokeJoin="round"
          />
        </Group>
      </Canvas>
    </View>
  );
}
