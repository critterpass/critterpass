/**
 * A drawn signature as it is stored (a media object with purpose `signature`, JSON): the pad's
 * size and its SVG path, so any stamp can scale it into its own box. Read back strictly: anything
 * else is no signature, and the signer's name is written in their colour instead.
 */
export interface SignatureStroke {
  readonly v: 1;
  readonly width: number;
  readonly height: number;
  readonly path: string;
}

/** The most a stroke may weigh (the media purpose allows 256 KB). */
export const STROKE_MAX_BYTES = 256 * 1024;
const PATH = /^[ML0-9 .-]+$/u;

export function encodeStroke(stroke: SignatureStroke): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(stroke));
}

export function decodeStroke(text: string): SignatureStroke | null {
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const { v, width, height, path } = value as Record<string, unknown>;
  if (v !== 1 || typeof path !== 'string' || !PATH.test(path) || path.length === 0) return null;
  if (typeof width !== 'number' || typeof height !== 'number' || width <= 0 || height <= 0) {
    return null;
  }
  return { v: 1, width, height, path };
}
