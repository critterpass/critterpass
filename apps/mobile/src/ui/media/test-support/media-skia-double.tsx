/**
 * The repo's Skia stand-in plus what the media layer draws with: the colour matrix renders as an
 * inspectable `View`, `useImage` hands back a token naming the URI it was asked for (no decoder
 * under Jest), and the raw-pixel image factory the blurhash placeholder uses returns a token too.
 */
import type { ReactNode } from 'react';
import { View } from 'react-native';

export * from '../../test-support/skia-double';

export function ColorMatrix(props: { readonly matrix: readonly number[]; children?: ReactNode }) {
  return <View testID="skia-color-matrix" accessible={false} {...{ skiaProps: props }} />;
}

export function useImage(uri: string): { readonly uri: string } {
  return { uri };
}

export const AlphaType = { Unpremul: 3 } as const;
export const ColorType = { RGBA_8888: 4 } as const;
export const Skia = {
  Image: {
    MakeImage: (info: { width: number; height: number }) => ({ placeholder: info }),
  },
  Data: { fromBytes: (bytes: Uint8Array) => bytes },
};
