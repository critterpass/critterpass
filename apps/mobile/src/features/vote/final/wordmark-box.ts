/**
 * The box a wordmark takes on the showdown (3c-1) and the reveal (3c-2). The renders set a place's
 * name on a tight line (0.8 em) with its capitals filling it, so KYOTO at 120 pt is 96 pt tall. The
 * text primitive always keeps room above a display line for stacked Vietnamese marks, and sets
 * looser leading in Vietnamese, which made every name about 175 pt tall. Here the box is the
 * designed line, plus room only for the marks the name really has (ĐÀ NẴNG above, HỘI AN above and
 * below), and the text is placed in it so the capitals sit where the render puts them.
 */
import { scriptForLocale } from '@/lib/fonts';
import { FACE_METRICS, lineBoxEm } from '@/ui/text/glyph-room';

/** The display face every wordmark is set in. */
const FACE_NAME = 'Archivo';
const FACE = FACE_METRICS[FACE_NAME] ?? { ascent: 0, descent: 0, glyphTop: 0, capHeight: 0 };

/** Combining marks drawn under a letter (dot below, cedilla, ogonek, comma below). */
const BELOW_MARK = /[̖-̙̜-̠̣-̳̹-̼͇ͅ-͉]/u;
const ANY_MARK = /[̀-ͯ]/u;
/** Capitals and punctuation that hang under the baseline. */
const HANGING = /[Q,;]/u;
/** What the display face covers: Latin with its extensions (Vietnamese included) and punctuation. */
const DISPLAY_FACE_TEXT = /^[ -ɏḀ-ỿ‐-‧]*$/u;

/** Extra room a name needs around its capitals, in em. */
export interface MarkRoom {
  readonly top: number;
  readonly bottom: number;
}

/** Where the baseline sits under the top of a line `leading` em tall, with the face centred on it. */
function baselineIn(leading: number): number {
  return (leading - (FACE.ascent + FACE.descent)) / 2 + FACE.ascent;
}

/**
 * The room a name's own marks need outside a line `leading` em tall: above, when a letter carries a
 * mark over its capital (À, Ẵ, Ư: up to the face's tallest stack); below, when one hangs under the
 * baseline (Ộ, Ç, Q). A plain name (KYOTO) needs none.
 */
export function markRoom(name: string, leading: number): MarkRoom {
  let above = false;
  let below = HANGING.test(name);
  for (const char of name.normalize('NFD')) {
    if (!ANY_MARK.test(char)) continue;
    if (BELOW_MARK.test(char)) below = true;
    else above = true;
  }
  const baseline = baselineIn(leading);
  return {
    top: above ? Math.max(0, FACE.glyphTop - baseline) : 0,
    bottom: below ? Math.max(0, FACE.descent - (leading - baseline)) : 0,
  };
}

/**
 * True when the name is set in the display face, whose metrics the box is worked out from. Thai and
 * CJK languages and names in other scripts use another face and keep the text's own box.
 */
export function setInDisplayFace(name: string, locale: string): boolean {
  const script = scriptForLocale(locale);
  return (script === 'latin' || script === 'vietnamese') && DISPLAY_FACE_TEXT.test(name);
}

/** The type size, from the capital height the platform measured (the designed size without one). */
export function typeSize(capHeight: number | undefined, designSize: number): number {
  if (capHeight === undefined || !(capHeight > 0) || FACE.capHeight <= 0) return designSize;
  const size = capHeight / FACE.capHeight;
  // Larger text settings scale display type by half their factor; anything further off is a
  // measurement of some other face.
  return size > designSize * 0.5 && size < designSize * 2.5 ? size : designSize;
}

export interface TextLayout {
  /** The type size, in points. */
  readonly size: number;
  /** One line's height. */
  readonly line: number;
  /** The height of the text when it is one line: the line and the room the primitive adds. */
  readonly oneLine: number;
  /** The height of the text as it is laid out (one line or more). */
  readonly height: number;
}

export interface WordmarkBox {
  /** The box's height. */
  readonly height: number;
  /** Where the box's top edge is, measured down from the top of the laid-out text. */
  readonly top: number;
}

/**
 * The designed box for a laid-out name: `leading` em for its last line, the text's own leading
 * between lines, and the name's mark room. `top` says how far the text is pulled up so its first
 * line's capitals sit in the box as the render sets them.
 */
export function wordmarkBox(layout: TextLayout, leading: number, room: MarkRoom): WordmarkBox {
  const { size, line, oneLine, height } = layout;
  // The primitive pads the text above its first line; the baseline is where the platform puts it
  // on that line (centred, or riding high on iOS when the line is shorter than the face).
  const padding = Math.max(0, oneLine - line);
  const ratio = line / size;
  const natural = baselineIn(ratio) - lineBoxEm(FACE_NAME, ratio).shift;
  const firstBaseline = padding + natural * size;
  return {
    height: height - oneLine + (leading + room.top + room.bottom) * size,
    top: firstBaseline - (baselineIn(leading) + room.top) * size,
  };
}

/** The height kept for a name before it is measured: one line at the designed size. */
export function reservedHeight(designSize: number, leading: number, room: MarkRoom): number {
  return (leading + room.top + room.bottom) * designSize;
}
