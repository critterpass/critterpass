import { Path } from '@shopify/react-native-skia';

import { barsPath } from './geometry';
import { TEXTURE } from './texture-tokens';
import { TextureCanvas } from './TextureCanvas';

export interface BarcodeProps {
  /** Bar colour; defaults to the token ink (use paper on dark tickets). */
  readonly color?: string;
}

/** `tex.barcode`: 2/2 pt bars filling the parent (tickets, receipts). Decorative only. */
export function Barcode({ color }: BarcodeProps) {
  const { bar, gap } = TEXTURE.barcode;
  return (
    <TextureCanvas testID="texture-barcode">
      {({ width, height }) => (
        <Path path={barsPath(width, height, bar, gap)} color={color ?? TEXTURE.barcode.color} />
      )}
    </TextureCanvas>
  );
}
