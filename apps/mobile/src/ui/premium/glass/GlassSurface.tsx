import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import type { ReactNode } from 'react';
import { Platform, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import type { PremiumGlassKind } from '@cp/design-tokens';

import { usePremiumTheme } from '../theme/PremiumThemeProvider';

export type GlassKind = PremiumGlassKind;

export interface GlassSurfaceProps {
  /**
   * `clear` over photos and maps, `regular` over app content (bars, banners, search), `nav` for
   * header buttons and glass pills, `sheet` for sheets. @default 'regular'
   */
  readonly kind?: GlassKind;
  /** Native glass reacts to touch (only on tappable controls). */
  readonly interactive?: boolean;
  /**
   * The design's composited material on iOS too, for glass that lies over busy content it must
   * not show through (a menu over a list of stops, whose numbers read through the system glass).
   */
  readonly opaque?: boolean;
  readonly style?: StyleProp<ViewStyle>;
  readonly children?: ReactNode;
  readonly testID?: string | undefined;
}

/** Liquid Glass ships with iOS 26 (the app's minimum); read once, it never changes at runtime. */
export const NATIVE_GLASS = Platform.OS === 'ios' && isLiquidGlassAvailable();

/**
 * The premium glass material. On iOS it is the system Liquid Glass (`GlassView`), which supplies
 * blur, refraction and its own Reduce Transparency fallback, following the theme's scheme rather
 * than the phone's. The `sheet` kind is the design's opaque sheet material on every platform.
 * Elsewhere it is the design's fallback: the tint composited on a solid ground
 * with the highlight, ring and drop stack, and no blur.
 *
 * Never fade glass or a parent of it below full opacity (the system stops drawing it), never put
 * glass inside glass, and keep it to chrome: no glass inside list cells or scrolling cards.
 */
export function GlassSurface({
  kind = 'regular',
  interactive = false,
  opaque = false,
  style,
  children,
  testID,
}: GlassSurfaceProps) {
  const t = usePremiumTheme();

  // Sheets stay opaque on iOS too: the design's sheets never show the page through their body
  // (the plan map's day sheet showed its streets and pins through the system glass).
  if (NATIVE_GLASS && kind !== 'sheet' && !opaque) {
    return (
      <GlassView
        testID={testID}
        glassEffectStyle={kind === 'clear' ? 'clear' : 'regular'}
        // The system's clear glass has no tint of its own, so its white glyphs vanished on a light
        // sky: the kit's clear tint keeps them legible over any photo or map. In dark the system's
        // regular glass took the colour of a dark map under it and only its glyph was left: the
        // design's dark tint lifts it off as the design's dark glass does.
        {...(kind === 'clear' || t.scheme === 'dark' ? { tintColor: t.material[kind].tint } : {})}
        colorScheme={t.scheme}
        isInteractive={interactive}
        style={style}
      >
        {children}
      </GlassView>
    );
  }

  const material = t.material[kind];
  return (
    <View
      testID={testID}
      style={[{ backgroundColor: material.fill, boxShadow: t.materialShadow[kind] }, style]}
    >
      {children}
    </View>
  );
}
