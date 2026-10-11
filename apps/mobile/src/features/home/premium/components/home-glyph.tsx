/**
 * Line glyphs Home needs that the premium kit does not draw yet (bell, search, chat, gear, the
 * title chevron), on the kit's 24 grid with its stroke and round joins. Decorative: the control
 * holding one carries the label.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SVG path data, never rendered copy. */
import { Canvas, Group, Path } from '@shopify/react-native-skia';
import { View } from 'react-native';

import { usePremiumTheme } from '@/ui/premium';

export const HOME_GLYPHS = {
  bell: 'M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5a2.2 2.2 0 0 0 4 0',
  search: 'M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM15.5 15.5 20 20',
  chat: 'M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 3.5V17h0A2.5 2.5 0 0 1 4 14.5z',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7',
  chevronDown: 'M6 9.5l6 6 6-6',
  chevronUp: 'M6 14.5l6-6 6 6',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  hash: 'M9 4 7 20M17 4l-2 16M4.5 9h16M3.5 15h16',
} as const;
export type HomeGlyphName = keyof typeof HOME_GLYPHS;

export interface HomeGlyphProps {
  readonly name: HomeGlyphName;
  readonly size?: number;
  readonly color?: string;
  readonly stroke?: number;
}

export function HomeGlyph({ name, size = 22, color, stroke = 2 }: HomeGlyphProps) {
  const t = usePremiumTheme();
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size }}
    >
      <Canvas style={{ width: size, height: size }}>
        <Group transform={[{ scale: size / 24 }]}>
          <Path
            path={HOME_GLYPHS[name]}
            color={color ?? t.color.ink}
            style="stroke"
            strokeWidth={stroke}
            strokeCap="round"
            strokeJoin="round"
          />
        </Group>
      </Canvas>
    </View>
  );
}
