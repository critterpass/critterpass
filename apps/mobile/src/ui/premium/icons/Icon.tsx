import { Canvas, Group, Path } from '@shopify/react-native-skia';
import { I18nManager, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { usePremiumTheme } from '../theme/PremiumThemeProvider';
import { PREMIUM_GLYPHS } from './glyphs';
import type { PremiumGlyph, PremiumIconName } from './glyphs';

/** Glyphs that point along the reading direction and flip in right-to-left layouts. */
const DIRECTIONAL = new Set<PremiumIconName>(['back', 'forward']);

export interface IconProps {
  readonly name: PremiumIconName;
  /** @default 24 */
  readonly size?: number;
  /** @default the theme's ink */
  readonly color?: string;
  /** Overrides the glyph's own stroke width (in 24-grid units). */
  readonly stroke?: number;
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string;
}

/**
 * A premium line icon. Icons are decorative: the control that holds one carries the label, so the
 * icon itself is hidden from assistive tech.
 */
export function Icon({ name, size, color, stroke, style, testID }: IconProps) {
  const theme = usePremiumTheme();
  const glyph: PremiumGlyph = PREMIUM_GLYPHS[name];
  const side = size ?? theme.size.icon;
  const flip = I18nManager.isRTL && DIRECTIONAL.has(name);
  const scale = side / theme.size.icon;

  return (
    <View
      testID={testID}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={[{ width: side, height: side }, flip ? { transform: [{ scaleX: -1 }] } : null, style]}
    >
      <Canvas style={{ width: side, height: side }}>
        <Group transform={[{ scale }]}>
          <Path
            path={glyph.d}
            color={color ?? theme.color.ink}
            style={glyph.fill === true ? 'fill' : 'stroke'}
            strokeWidth={stroke ?? glyph.stroke}
            strokeCap="round"
            strokeJoin="round"
          />
        </Group>
      </Canvas>
    </View>
  );
}

export type { PremiumIconName };
