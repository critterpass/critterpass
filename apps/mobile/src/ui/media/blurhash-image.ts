/**
 * A blurhash as a tiny Skia image: decoded once per hash (32 × 20 pixels, stretched to cover the
 * slot) and kept for the session, so the placeholder shows on the first frame.
 */
import { decodeBlurhash, isBlurhash } from '@/lib/media/blurhash';
import { AlphaType, ColorType, Skia, type SkImage } from '@shopify/react-native-skia';

const WIDTH = 32;
const HEIGHT = 20;
const decoded = new Map<string, SkImage | null>();

export function blurhashImage(hash: string): SkImage | null {
  const cached = decoded.get(hash);
  if (cached !== undefined) return cached;
  let image: SkImage | null = null;
  if (isBlurhash(hash)) {
    const pixels = decodeBlurhash(hash, WIDTH, HEIGHT);
    image = Skia.Image.MakeImage(
      {
        width: WIDTH,
        height: HEIGHT,
        colorType: ColorType.RGBA_8888,
        alphaType: AlphaType.Unpremul,
      },
      Skia.Data.fromBytes(new Uint8Array(pixels.buffer)),
      WIDTH * 4,
    );
  }
  decoded.set(hash, image);
  return image;
}
