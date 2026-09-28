/* eslint-disable lingui/no-unlocalized-strings -- keys, paths and metadata names, not UI copy. */
/**
 * Test support for the OG suite: assets read from the site's own `public/` folder, and an
 * in-memory stand-in for the R2 bucket binding (the storage boundary).
 */
import { readFile } from 'node:fs/promises';

import type { OgBucket } from './cache';
import type { AssetLoader } from './render';

const PUBLIC_DIR = new URL('../../../public/', import.meta.url);

export const loadPublicAsset: AssetLoader = async (path) => {
  const bytes = await readFile(new URL(`.${path}`, PUBLIC_DIR));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
};

export class MemoryBucket implements OgBucket {
  readonly objects = new Map<string, { bytes: Uint8Array; metadata: Record<string, string> }>();

  get(key: string): ReturnType<OgBucket['get']> {
    const object = this.objects.get(key);
    if (object === undefined) return Promise.resolve(null);
    return Promise.resolve({
      customMetadata: object.metadata,
      arrayBuffer: () => Promise.resolve(object.bytes.slice().buffer),
    });
  }

  put(
    key: string,
    value: ArrayBuffer | Uint8Array,
    options?: { customMetadata?: Record<string, string> },
  ): Promise<unknown> {
    this.objects.set(key, {
      bytes: new Uint8Array(value instanceof Uint8Array ? value : new Uint8Array(value)),
      metadata: options?.customMetadata ?? {},
    });
    return Promise.resolve(undefined);
  }

  delete(key: string): Promise<void> {
    this.objects.delete(key);
    return Promise.resolve();
  }
}
