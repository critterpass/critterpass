/* eslint-disable lingui/no-unlocalized-strings -- asset paths and font family names, not UI copy. */
/**
 * Takumi (WebAssembly) in the Worker: one renderer per isolate with the card faces registered,
 * sticker art passed in per render. Assets come from the site's own static files through
 * `loadAsset`, so the renderer never reaches the network.
 */
import init, { Renderer } from '@takumi-rs/wasm';
import wasmModule from '@takumi-rs/wasm/auto';
import type { Node } from '@takumi-rs/helpers';

import { OG_HEIGHT, OG_WIDTH } from './templates/shared';

export type AssetLoader = (path: string) => Promise<ArrayBuffer>;

const FACES = [
  { name: 'Archivo', file: 'Archivo-W62-900', weight: 900 },
  { name: 'Geist', file: 'Geist-500', weight: 500 },
  { name: 'Geist', file: 'Geist-600', weight: 600 },
  { name: 'Geist Mono', file: 'GeistMono-500', weight: 500 },
] as const;

let ready: Promise<Renderer> | undefined;

function renderer(loadAsset: AssetLoader): Promise<Renderer> {
  ready ??= (async () => {
    // Under workerd the export is the compiled module; under Node it is already instantiated.
    await init(
      wasmModule instanceof WebAssembly.Module ? { module_or_path: wasmModule } : undefined,
    );
    const instance = new Renderer();
    const fonts = await Promise.all(FACES.map((face) => loadAsset(`/fonts/${face.file}.woff2`)));
    FACES.forEach((face, index) => {
      instance.registerFont({
        name: face.name,
        weight: face.weight,
        data: fonts[index] as ArrayBuffer,
      });
    });
    return instance;
  })().catch((error: unknown) => {
    ready = undefined;
    throw error;
  });
  return ready;
}

/** The baked sticker for a critter kind (idle pose, 232 pt at 2x). */
export function stickerPath(kind: string): string {
  return `/critters/${kind}-common-idle-color-232pt@2x.webp`;
}

export async function renderCard(
  node: Node,
  stickers: readonly string[],
  loadAsset: AssetLoader,
): Promise<Uint8Array<ArrayBuffer>> {
  const instance = await renderer(loadAsset);
  const images = await Promise.all(
    stickers.map(async (kind) => ({ src: kind, data: await loadAsset(stickerPath(kind)) })),
  );
  return instance.render(node, { width: OG_WIDTH, height: OG_HEIGHT, format: 'png', images });
}
