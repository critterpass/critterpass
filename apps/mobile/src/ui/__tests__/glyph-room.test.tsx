import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from '@jest/globals';
import { StyleSheet } from 'react-native';
import type { TextStyle } from 'react-native';

import { renderWithI18n } from '../../lib/i18n/testing';
import { ThemeProvider } from '../../lib/theme';
import { FACE_METRICS, glyphRoomStyle, topGlyphRoomEm } from '../text/glyph-room';
import { Text, TEXT_VARIANTS } from '../text/Text';
import type { TextVariant } from '../text/Text';

const FONTS_DIR = join(__dirname, '../../../assets/fonts');

/** Minimal TrueType reader: hhea line metrics and the outline bounds of the glyphs for `chars`. */
function measureFace(file: string, chars: string) {
  const data = readFileSync(join(FONTS_DIR, file));
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const tables = new Map<string, number>();
  for (let i = 0; i < view.getUint16(4); i += 1) {
    const record = 12 + i * 16;
    tables.set(data.toString('latin1', record, record + 4), view.getUint32(record + 8));
  }
  const table = (tag: string) => {
    const offset = tables.get(tag);
    if (offset === undefined) throw new Error(`${file} has no ${tag} table`);
    return offset;
  };
  const head = table('head');
  const unitsPerEm = view.getUint16(head + 18);
  const longLoca = view.getInt16(head + 50) === 1;
  const hhea = table('hhea');

  // cmap format 4 (the Unicode BMP subtable): code point → glyph id.
  const cmap = table('cmap');
  let format4 = -1;
  for (let i = 0; i < view.getUint16(cmap + 2); i += 1) {
    const sub = cmap + view.getUint32(cmap + 4 + i * 8 + 4);
    if (view.getUint16(sub) === 4) format4 = sub;
  }
  if (format4 < 0) throw new Error(`${file} has no format 4 cmap`);
  const segments = view.getUint16(format4 + 6) / 2;
  const ends = format4 + 14;
  const starts = ends + segments * 2 + 2;
  const deltas = starts + segments * 2;
  const rangeOffsets = deltas + segments * 2;
  const glyphFor = (code: number): number => {
    for (let s = 0; s < segments; s += 1) {
      if (code > view.getUint16(ends + s * 2)) continue;
      const start = view.getUint16(starts + s * 2);
      if (code < start) return 0;
      const delta = view.getInt16(deltas + s * 2);
      const rangeAt = rangeOffsets + s * 2;
      const range = view.getUint16(rangeAt);
      if (range === 0) return (code + delta) & 0xffff;
      const glyph = view.getUint16(rangeAt + range + (code - start) * 2);
      return glyph === 0 ? 0 : (glyph + delta) & 0xffff;
    }
    return 0;
  };

  const loca = table('loca');
  const glyf = table('glyf');
  const locaAt = (id: number) =>
    longLoca ? view.getUint32(loca + id * 4) : view.getUint16(loca + id * 2) * 2;
  let top = -Infinity;
  let bottom = Infinity;
  for (const char of chars) {
    const id = glyphFor(char.codePointAt(0) ?? 0);
    if (id === 0 || locaAt(id) === locaAt(id + 1)) continue;
    const glyph = glyf + locaAt(id);
    bottom = Math.min(bottom, view.getInt16(glyph + 4));
    top = Math.max(top, view.getInt16(glyph + 8));
  }
  return {
    ascent: view.getInt16(hhea + 4) / unitsPerEm,
    descent: -view.getInt16(hhea + 6) / unitsPerEm,
    glyphTop: top / unitsPerEm,
    glyphBottom: -bottom / unitsPerEm,
  };
}

const LATIN =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789ÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝŸİŞĞ';
const VIETNAMESE =
  'ĐđẠẢẤẦẨẪẬẮẰẲẴẶẸẺẼẾỀỂỄỆỈỊỌỎỐỒỔỖỘỚỜỞỠỢỤỦỨỪỬỮỰỲỴỶỸạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ';
const THAI = Array.from({ length: 0x5b }, (_, i) => String.fromCodePoint(0x0e01 + i)).join('');

describe('bundled face metrics', () => {
  const files = readdirSync(FONTS_DIR).filter((name) => name.endsWith('.ttf'));

  it.each(files)('%s stays inside the metrics its text is laid out with', (file) => {
    const family = file.split('-', 1)[0] ?? '';
    const expected = FACE_METRICS[family];
    expect(expected).toBeDefined();
    const face = measureFace(file, family === 'NotoSansThai' ? THAI : LATIN + VIETNAMESE);
    expect(expected?.ascent).toBeCloseTo(face.ascent, 3);
    expect(expected?.descent).toBeCloseTo(face.descent, 3);
    // No glyph reaches higher than the recorded top or lower than the descender (give or take one
    // font unit, 0.001 em: Archivo's heaviest ogoneks overshoot by exactly that).
    expect(expected?.glyphTop).toBeGreaterThanOrEqual(face.glyphTop - 0.0005);
    expect(face.glyphBottom).toBeLessThanOrEqual(face.descent + 0.0015);
  });
});

describe('glyph room', () => {
  const variants = Object.keys(TEXT_VARIANTS) as TextVariant[];
  const STACKED = 'VIỆT NAM · ĐẶT CHỖ · CHUYẾN ĐI';

  // Every variant, in a Latin, a Vietnamese and a Thai locale, at 1x and 2x text size: the first
  // line's tallest glyph must fit inside the text box, and the box must sit exactly where the
  // designed leading puts it (the room is padded in and pulled back out).
  it.each(['en', 'vi', 'th'])('fits every glyph of every variant in %s', async (locale) => {
    for (const fontScale of [1, 2]) {
      const { getAllByTestId } = await renderWithI18n(
        <ThemeProvider fontScale={fontScale}>
          {variants.map((variant) => (
            <Text key={variant} testID="sample" variant={variant} autoFit={false}>
              {STACKED}
            </Text>
          ))}
        </ThemeProvider>,
        { locale },
      );
      for (const node of getAllByTestId('sample')) {
        const style: TextStyle = StyleSheet.flatten(node.props.style as TextStyle) ?? {};
        const fontSize = style.fontSize ?? 0;
        const lineHeight = style.lineHeight ?? 0;
        const metrics = FACE_METRICS[String(style.fontFamily).split('-', 1)[0] ?? ''];
        if (!metrics) continue;
        const faceHeight = metrics.ascent + metrics.descent;
        const multiplier = lineHeight / fontSize;
        const baselineFromTop =
          multiplier >= faceHeight
            ? (multiplier - faceHeight) / 2 + metrics.ascent
            : multiplier - metrics.descent;
        const paddingTop = (style.paddingTop as number | undefined) ?? 0;
        const marginTop = (style.marginTop as number | undefined) ?? 0;
        expect(paddingTop + baselineFromTop * fontSize).toBeGreaterThanOrEqual(
          metrics.glyphTop * fontSize - 0.001,
        );
        expect(paddingTop + marginTop).toBeCloseTo(0, 6);
      }
    }
  });

  it('gives the tight display leading room for stacked marks', () => {
    // Archivo at the display leading: caps and marks reach 1.059 em, the baseline sits 0.65 em down.
    expect(topGlyphRoomEm('Archivo-W70-900', 0.86)).toBeCloseTo(0.409, 3);
    expect(topGlyphRoomEm('Archivo-W70-900', 1.0)).toBeCloseTo(0.269, 3);
    expect(topGlyphRoomEm('system', 0.86)).toBe(0);
  });

  it('adds to the caller’s own top spacing and leaves non-numeric spacing alone', () => {
    expect(glyphRoomStyle(10, { paddingTop: 4, marginVertical: 6 })).toEqual({
      paddingTop: 14,
      marginTop: -4,
    });
    expect(glyphRoomStyle(10, { marginTop: 'auto' })).toBeNull();
    expect(glyphRoomStyle(0, undefined)).toBeNull();
  });
});
