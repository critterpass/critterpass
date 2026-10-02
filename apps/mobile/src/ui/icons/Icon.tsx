import { Canvas, Group, Path } from '@shopify/react-native-skia';
import { useEffect, useState } from 'react';
import { I18nManager, Image, PixelRatio, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { useSurfaceTone } from '../surface/Scaffold';
import type { SurfaceTone } from '../surface/Scaffold';
import type { Theme } from '../theme';
import { useTheme } from '../theme';
import { DOODLES } from './generated';
import type { DoodleName } from './generated';
import { cachedIconImage, iconImageKey, requestIconImage } from './icon-image';
import { DOODLE_A11Y } from './labels';
import { checkIconDraws } from '../qa/icon-check';

export interface IconProps {
  readonly name: DoodleName;
  /** Width in points; height follows the doodle's own aspect ratio. @default 24 */
  readonly size?: number;
  /** Brush-stroke colour; defaults to the surface's primary text colour. */
  readonly color?: string;
  /**
   * Wash colour behind the strokes; star, flame, sun, spark and heart have a default, and doodles
   * drawn only in this layer (arrow, circle, squiggle, underline) default to `color`.
   */
  readonly accent?: string;
  /** Overrides the registry label with the specific meaning ("Flight to Bali"). */
  readonly label?: string;
  /** Hides the icon from assistive tech, e.g. when a text label sits right next to it. */
  readonly decorative?: boolean;
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string;
}

function inkFor(theme: Theme, tone: SurfaceTone): string {
  if (tone === 'paper') return theme.color.paper.ink;
  if (tone === 'accent') return theme.semantic.text.onAccent;
  return theme.semantic.text.primary;
}

/** Resolves a `color.*` token path (`color.green.deep`) against the active theme. */
export function tokenColor(theme: Theme, tokenPath: string): string | undefined {
  let node: unknown = theme;
  for (const key of tokenPath.split('.')) {
    if (node === null || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[key];
  }
  if (typeof node === 'string') return node;
  if (node !== null && typeof node === 'object' && 'base' in node) {
    const { base } = node;
    return typeof base === 'string' ? base : undefined;
  }
  return undefined;
}

/**
 * A hand-drawn doodle icon (design/doodles.js) at any size: drawn once per size, colours and
 * density as a plain image (no GL surface per icon); a build without Skia's raster surface draws
 * it live.
 */
export function Icon({
  name,
  size = 24,
  color,
  accent,
  label,
  decorative,
  style,
  testID,
}: IconProps) {
  const theme = useTheme();
  const tone = useSurfaceTone();
  const def = DOODLES[name];
  const a11y = DOODLE_A11Y[name];
  const [vbWidth, vbHeight] = def.viewBox;
  const height = (size * vbHeight) / vbWidth;
  const ink = color ?? inkFor(theme, tone);
  const accentColor =
    accent ??
    (def.defaultAccent ? tokenColor(theme, def.defaultAccent) : undefined) ??
    // A doodle drawn only in its accent layer (arrow, circle, squiggle, underline) would otherwise
    // draw nothing: without an accent it is drawn in the brush colour.
    (def.layers.some((layer) => layer.paint === 'ink') ? undefined : ink);
  const resolvedLabel = label ?? a11y.label?.();
  const hidden = decorative === true || (a11y.decorative && label === undefined);
  const mirror = a11y.mirrorInRtl && I18nManager.isRTL;
  const scale = size / vbWidth;

  const paintFor = (paint: string): string | undefined => {
    if (paint === 'ink') return ink;
    if (paint === 'accent') return accentColor;
    return tokenColor(theme, paint);
  };
  const fills = def.layers.map((layer) => paintFor(layer.paint));
  checkIconDraws(
    name,
    def.layers.map((layer, index) => ({ fill: fills[index], opacity: layer.opacity })),
  );
  const imageInput = {
    name,
    layers: def.layers,
    fills,
    viewBoxWidth: vbWidth,
    width: size,
    height,
    mirror,
    scale: PixelRatio.get(),
  };
  const imageKey = iconImageKey(imageInput);
  const cached = cachedIconImage(imageInput);
  const [, drawn] = useState(0);
  useEffect(() => {
    if (cached !== undefined) return undefined;
    // Drawn after this frame; until then the icon shows live, never blank.
    return requestIconImage(imageInput, () => drawn((n) => n + 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `imageKey` is everything the picture depends on
  }, [imageKey, cached === undefined]);
  const uri = cached ?? null;

  return (
    <View
      testID={testID}
      style={[{ width: size, height }, style]}
      pointerEvents="none"
      {...(hidden
        ? {
            accessible: false,
            accessibilityElementsHidden: true,
            importantForAccessibility: 'no-hide-descendants' as const,
          }
        : {
            accessible: true,
            accessibilityRole: 'image' as const,
            accessibilityLabel: resolvedLabel,
          })}
    >
      {uri !== null ? (
        <Image
          source={{ uri }}
          style={{ width: size, height }}
          fadeDuration={0}
          accessible={false}
          testID="icon-image"
        />
      ) : (
        <Canvas style={{ width: size, height }}>
          <Group
            transform={
              mirror ? [{ translateX: size }, { scaleX: -scale }, { scaleY: scale }] : [{ scale }]
            }
          >
            {def.layers.map((layer, index) => {
              const fill = paintFor(layer.paint);
              if (fill === undefined) return null;
              return (
                <Path
                  key={index}
                  path={layer.d}
                  color={fill}
                  opacity={layer.opacity ?? 1}
                  {...(layer.multiply ? { blendMode: 'multiply' as const } : {})}
                />
              );
            })}
          </Group>
        </Canvas>
      )}
    </View>
  );
}
