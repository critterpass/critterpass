import { Canvas, Group, Path } from '@shopify/react-native-skia';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { usePremiumTheme } from '@/ui/premium';

import { LINE_GLYPHS, type LineIconName } from './line-glyphs';

export interface LineIconProps {
  readonly name: LineIconName;
  /** @default the kit's icon size (24) */
  readonly size?: number;
  /** @default the theme's ink */
  readonly color?: string;
  readonly stroke?: number;
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string;
}

/**
 * A line icon from the trip and wallet set, drawn like the kit's `Icon`. Decorative: the control
 * holding it carries the label.
 */
export function LineIcon({ name, size, color, stroke, style, testID }: LineIconProps) {
  const theme = usePremiumTheme();
  const glyph = LINE_GLYPHS[name];
  const side = size ?? theme.size.icon;
  return (
    <View
      testID={testID}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[{ width: side, height: side }, style]}
    >
      <Canvas style={{ width: side, height: side }}>
        <Group transform={[{ scale: side / theme.size.icon }]}>
          <Path
            path={glyph.d}
            color={color ?? theme.color.ink}
            style="stroke"
            strokeWidth={stroke ?? glyph.stroke}
            strokeCap="round"
            strokeJoin="round"
          />
        </Group>
      </Canvas>
    </View>
  );
}

export type { LineIconName };
