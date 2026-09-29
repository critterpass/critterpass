import { StyleSheet } from 'react-native';
import type { StyleProp, TextStyle } from 'react-native';

/**
 * Vertical extents of each bundled face, in em, over its whole weight/width family: `ascent` and
 * `descent` are the hhea line metrics the platforms lay lines out with, and `glyphTop` the highest
 * outline of any Latin or Vietnamese glyph the face covers, stacked marks
 * such as Ệ and Ữ included (Thai for Noto Sans Thai). Measured from apps/mobile/assets/fonts; the
 * glyph-room test re-measures the files and fails when a face changes.
 */
export const FACE_METRICS: Readonly<
  Record<string, { readonly ascent: number; readonly descent: number; readonly glyphTop: number }>
> = {
  Archivo: { ascent: 0.878, descent: 0.21, glyphTop: 1.059 },
  Geist: { ascent: 1.005, descent: 0.295, glyphTop: 1.082 },
  GeistMono: { ascent: 1.005, descent: 0.295, glyphTop: 1.076 },
  Mynerve: { ascent: 0.93, descent: 0.38, glyphTop: 0.965 },
  NotoSansThai: { ascent: 1.061, descent: 0.45, glyphTop: 0.865 },
};

/** `Archivo-W70-900` → `Archivo`; the OS default face (`system`) has no bundled metrics. */
function faceMetrics(fontFamily: string) {
  return FACE_METRICS[fontFamily.split('-', 1)[0] ?? ''];
}

/**
 * Extra room, in em, the first line needs above its box so no glyph is clipped. A line at least as
 * tall as the face is centred on it, so only marks above the ascender can poke out, less half the
 * spare leading. A shorter line (the display styles' tight 0.86 leading) keeps the descender
 * inside and gives up the top on both iOS and Android: the baseline sits `descent` above the line's
 * bottom, so anything taller than `lineHeight - descent` pokes out of the text view and is cut.
 */
export function topGlyphRoomEm(fontFamily: string, lineHeightMultiplier: number): number {
  const metrics = faceMetrics(fontFamily);
  if (!metrics) return 0;
  const { ascent, descent, glyphTop } = metrics;
  const faceHeight = ascent + descent;
  const baselineFromTop =
    lineHeightMultiplier >= faceHeight
      ? (lineHeightMultiplier - faceHeight) / 2 + ascent
      : lineHeightMultiplier - descent;
  return Math.max(0, glyphTop - baselineFromTop);
}

function numeric(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

/**
 * Pads the text box by `room` points at the top and pulls it back up by the same amount, so the
 * glyphs render in full while the text keeps the designed tight leading against what sits above it.
 * The caller's own top padding and margin are kept and added to; a non-numeric one (`'auto'`, a
 * percentage) can't be offset, so the text is left as the caller set it.
 */
export function glyphRoomStyle(
  room: number,
  style: StyleProp<TextStyle>,
  /** Keep the room inside the text's own slot instead of pulling it up (see `Text`). */
  flush = false,
): TextStyle | null {
  if (room <= 0) return null;
  const flat = StyleSheet.flatten(style) ?? {};
  const padding = flat.paddingTop ?? flat.paddingVertical ?? flat.padding ?? 0;
  const margin = flat.marginTop ?? flat.marginVertical ?? flat.margin ?? 0;
  const paddingTop = numeric(padding);
  const marginTop = numeric(margin);
  if (paddingTop === undefined || marginTop === undefined) return null;
  return { paddingTop: paddingTop + room, marginTop: flush ? marginTop : marginTop - room };
}
