/**
 * Stand-in for `Sticker` in onboarding screen tests. Skia has no native renderer under Jest (the
 * repo's skia-double covers containers only), and a sticker's own drawing is covered by the
 * sticker suites with the CanvasKit engine; screens only need the sticker to exist and be named.
 */
import { View } from 'react-native';

export function Sticker({ name, size }: { readonly name: string; readonly size: number }) {
  return <View accessibilityLabel={name} style={{ width: size, height: size }} />;
}
