/**
 * The repo's Skia stand-in plus what the cut-out sticker draws with: image filters render as
 * inspectable `View`s like every other primitive, and `useImage` hands back a decoded-image token
 * for any URI (there is no decoder under Jest), so suites can assert the outline and the cut-out.
 */
import { View } from 'react-native';
import type { ReactNode } from 'react';

export * from '../../test-support/skia-double';

function filter(kind: string) {
  function SkiaFilter({ children, ...props }: { children?: ReactNode; [prop: string]: unknown }) {
    return (
      <View testID={`skia-${kind}`} accessible={false} {...{ skiaProps: props }}>
        {children}
      </View>
    );
  }
  SkiaFilter.displayName = `Skia${kind}`;
  return SkiaFilter;
}

export const BlendColor = filter('blend-color');
export const Morphology = filter('morphology');

export function useImage(uri: string): { readonly uri: string } {
  return { uri };
}
