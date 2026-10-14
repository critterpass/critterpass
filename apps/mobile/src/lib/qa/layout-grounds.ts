/**
 * The surfaces the layout checks treat as hiding what was drawn before them (./layout-tree): a
 * ground colour opaque enough to read as one, and a band whose gradient starts solid at an edge
 * (the scroll edge's fade under the status bar).
 */

/** False for a colour that draws nothing (transparent, or almost all alpha gone). */
export function drawsGround(colour: unknown): boolean {
  if (colour === undefined || colour === null) return false;
  if (typeof colour !== 'string') return true;
  const value = colour.trim().toLowerCase();
  if (value === 'transparent') return false;
  const hex = /^#(?:[0-9a-f]{3}([0-9a-f])|[0-9a-f]{6}([0-9a-f]{2}))$/u.exec(value);
  if (hex) {
    const alpha =
      hex[1] !== undefined ? parseInt(hex[1] + hex[1], 16) : parseInt(hex[2] ?? 'ff', 16);
    return alpha >= 128;
  }
  const rgba = /^(?:rgba|hsla)\([^,]+,[^,]+,[^,]+,\s*([\d.]+%?)\s*\)$/u.exec(value);
  if (rgba?.[1] !== undefined) {
    const alpha = rgba[1].endsWith('%') ? parseFloat(rgba[1]) / 100 : parseFloat(rgba[1]);
    return alpha >= 0.5;
  }
  return true;
}

/**
 * A surface that hides what was drawn before it: its box, and the opaque share of its height
 * from one edge (a whole ground is 1 from the top; a band fading the content into the ground
 * under the status bar is opaque for its first part only).
 */
export interface TreeGround {
  readonly box: number;
  readonly edge: 'top' | 'bottom';
  readonly share: number;
}

/** The opaque part of a band drawn as a linear gradient from a solid colour at one edge. */
export function solidBand(image: unknown): { edge: 'top' | 'bottom'; share: number } | null {
  if (typeof image !== 'string') return null;
  const band = /^linear-gradient\((180|0)deg,\s*(.+?)\s+0%,\s*(.+?)\s+([\d.]+)%/u.exec(
    image.trim(),
  );
  if (band === null) return null;
  const [, angle, from, to, until] = band;
  const share = Number(until) / 100;
  if (!drawsGround(from) || !drawsGround(to) || !(share > 0)) return null;
  return { edge: angle === '180' ? 'top' : 'bottom', share: Math.min(1, share) };
}
