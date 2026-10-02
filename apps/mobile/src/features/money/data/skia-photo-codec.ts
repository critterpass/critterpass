/**
 * The receipt photo codec on the device: Skia (already in the app) decodes the photo, draws it
 * scaled on an offscreen surface and encodes the JPEG, so no extra native module is needed.
 */
/* eslint-disable @typescript-eslint/no-require-imports, lingui/no-unlocalized-strings -- Skia loads lazily (importing this never forces it under Jest); the literal is a module name. */
import type * as RNSkiaModule from '@shopify/react-native-skia';

import type { PhotoCodec } from './receipt-photo';

function skia(): typeof RNSkiaModule {
  return require('@shopify/react-native-skia') as typeof RNSkiaModule;
}

export const skiaPhotoCodec: PhotoCodec = {
  size(bytes) {
    const { Skia } = skia();
    const image = Skia.Image.MakeImageFromEncoded(Skia.Data.fromBytes(bytes));
    return image === null ? null : { width: image.width(), height: image.height() };
  },
  scaledJpeg(bytes, width, height, quality) {
    const { Skia, ImageFormat } = skia();
    const image = Skia.Image.MakeImageFromEncoded(Skia.Data.fromBytes(bytes));
    const surface = Skia.Surface.MakeOffscreen(width, height) ?? Skia.Surface.Make(width, height);
    if (image === null || surface === null) return null;
    surface
      .getCanvas()
      .drawImageRect(
        image,
        Skia.XYWHRect(0, 0, image.width(), image.height()),
        Skia.XYWHRect(0, 0, width, height),
        Skia.Paint(),
      );
    surface.flush();
    return surface.makeImageSnapshot().encodeToBytes(ImageFormat.JPEG, quality);
  },
};
