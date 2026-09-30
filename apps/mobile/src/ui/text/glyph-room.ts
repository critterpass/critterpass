import { Platform, StyleSheet } from 'react-native';
import type { StyleProp, TextStyle } from 'react-native';

/**
 * Vertical extents of each bundled face, in em, over its whole weight/width family: `ascent` and
 * `descent` are the hhea line metrics the platforms lay lines out with, and `glyphTop` the highest
 * outline of any Latin or Vietnamese glyph the face covers, stacked marks
 * such as Ệ and Ữ included (Thai for Noto Sans Thai), and `capHeight` the top of the flat capitals
 * (the Thai consonants' body for Noto Sans Thai), the box a label is centred on. Measured from
 * apps/mobile/assets/fonts; the glyph-room test re-measures the files and fails when a face changes.
 */
export const FACE_METRICS: Readonly<
  Record<
    string,
    {
      readonly ascent: number;
      readonly descent: number;
      readonly glyphTop: number;
      readonly capHeight: number;
    }
  >
> = {
  Archivo: { ascent: 0.878, descent: 0.21, glyphTop: 1.059, capHeight: 0.687 },
  Borel: { ascent: 1.364, descent: 0.636, glyphTop: 1.203, capHeight: 0.729 },
  Geist: { ascent: 1.005, descent: 0.295, glyphTop: 1.082, capHeight: 0.71 },
  GeistMono: { ascent: 1.005, descent: 0.295, glyphTop: 1.076, capHeight: 0.71 },
  NotoSansThai: { ascent: 1.034, descent: 0.477, glyphTop: 0.865, capHeight: 0.56 },
};

/** `Archivo-W70-900` → `Archivo`; the OS default face (`system`) has no bundled metrics. */
function faceMetrics(fontFamily: string) {
  return FACE_METRICS[fontFamily.split('-', 1)[0] ?? ''];
}

/** How a platform lays out a line shorter than the face: `ios` gives up the top, others centre it. */
export type LineLayout = 'ios' | 'centred';

export interface LineBox {
  /** Room the first line needs above its content so no glyph is clipped. */
  readonly room: number;
  /** How far the content moves down so the face sits centred on the line, as on Android. */
  readonly shift: number;
}

/**
 * Where a face's glyphs sit in a line box, in em. Android (and a line at least as tall as the face
 * on iOS) centres the face's ascent + descent on the line, splitting the spare or missing leading
 * evenly. iOS lays a shorter line (the display styles' tight 0.86 leading) with the baseline
 * `descent` above its bottom, giving up the whole difference at the top: its capitals ride high by
 * half of it. `shift` moves them back down, so both platforms centre the face on the line, and the
 * face's own ascent and descent (tools/scripts/fonts/build-fonts.py) centre its capitals.
 *
 * `room` is how far the tallest glyph (a stacked mark such as Ặ) rises above the content's top:
 * the text view is padded by that much, or the glyph is cut.
 */
export function lineBoxEm(
  fontFamily: string,
  lineHeightMultiplier: number,
  layout: LineLayout = Platform.OS === 'ios' ? 'ios' : 'centred',
): LineBox {
  const metrics = faceMetrics(fontFamily);
  if (!metrics) return { room: 0, shift: 0 };
  const { ascent, descent, glyphTop } = metrics;
  const faceHeight = ascent + descent;
  const centred = (lineHeightMultiplier - faceHeight) / 2 + ascent;
  const natural =
    layout === 'ios' && lineHeightMultiplier < faceHeight
      ? lineHeightMultiplier - descent
      : centred;
  return { room: Math.max(0, glyphTop - natural), shift: centred - natural };
}

function numeric(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

/**
 * Pads the text's content down by `room + shift` points and pulls the box back up by `room`, so
 * the glyphs render in full, the line keeps the designed tight leading against what sits above it
 * and the face sits centred on it; a `shift` is given back at the bottom, so the text's slot keeps
 * its height. The caller's own padding and margins are kept and added to; a non-numeric one
 * (`'auto'`, a percentage) can't be offset, so the text is left as the caller set it.
 */
export function glyphRoomStyle(
  { room, shift }: LineBox,
  style: StyleProp<TextStyle>,
  /** Keep the room inside the text's own slot instead of pulling it up (see `Text`). */
  flush = false,
): TextStyle | null {
  if (room <= 0 && shift <= 0) return null;
  const flat = StyleSheet.flatten(style) ?? {};
  const paddingTop = numeric(flat.paddingTop ?? flat.paddingVertical ?? flat.padding ?? 0);
  const marginTop = numeric(flat.marginTop ?? flat.marginVertical ?? flat.margin ?? 0);
  const marginBottom = numeric(flat.marginBottom ?? flat.marginVertical ?? flat.margin ?? 0);
  if (paddingTop === undefined || marginTop === undefined || marginBottom === undefined) {
    return null;
  }
  const offset = shift - room;
  return {
    paddingTop: paddingTop + room,
    marginTop: marginTop + (flush ? Math.max(0, offset) : offset),
    ...(shift > 0 ? { marginBottom: marginBottom - shift } : {}),
  };
}
