import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from '@jest/globals';
import { fireEvent, screen } from '@testing-library/react-native';
import { ScrollView, StyleSheet } from 'react-native';
import type { TextStyle } from 'react-native';

import { renderWithI18n } from '../../lib/i18n/testing';
import { ThemeProvider } from '../../lib/theme';
import { FACE_METRICS, glyphRoomStyle, lineBoxEm } from '../text/glyph-room';
import { Text, TEXT_VARIANTS } from '../text/Text';
import type { TextVariant } from '../text/Text';

const FONTS_DIR = join(__dirname, '../../../assets/fonts');

/**
 * Minimal TrueType reader: hhea line metrics, the outline bounds of the glyphs for `chars` and the
 * top of `capChars` (the flat letters a label is centred on).
 */
function measureFace(file: string, chars: string, capChars: string) {
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
  const bounds = (text: string) => {
    let top = -Infinity;
    let bottom = Infinity;
    for (const char of text) {
      const id = glyphFor(char.codePointAt(0) ?? 0);
      if (id === 0 || locaAt(id) === locaAt(id + 1)) continue;
      const glyph = glyf + locaAt(id);
      bottom = Math.min(bottom, view.getInt16(glyph + 4));
      top = Math.max(top, view.getInt16(glyph + 8));
    }
    return { top: top / unitsPerEm, bottom: -bottom / unitsPerEm };
  };
  const glyphs = bounds(chars);
  return {
    ascent: view.getInt16(hhea + 4) / unitsPerEm,
    descent: -view.getInt16(hhea + 6) / unitsPerEm,
    glyphTop: glyphs.top,
    glyphBottom: glyphs.bottom,
    capHeight: bounds(capChars).top,
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
    const thai = family === 'NotoSansThai';
    const face = measureFace(file, thai ? THAI : LATIN + VIETNAMESE, thai ? 'กดวน' : 'HEIN');
    expect(expected?.ascent).toBeCloseTo(face.ascent, 3);
    expect(expected?.descent).toBeCloseTo(face.descent, 3);
    // No glyph reaches higher than the recorded top or lower than the descender (give or take one
    // font unit, 0.001 em: Archivo's heaviest ogoneks overshoot by exactly that).
    expect(expected?.glyphTop).toBeGreaterThanOrEqual(face.glyphTop - 0.0005);
    expect(face.glyphBottom).toBeLessThanOrEqual(face.descent + 0.0015);
    // Every weight and width of a family shares one cap height, give or take 3 units.
    expect(Math.abs((expected?.capHeight ?? 0) - face.capHeight)).toBeLessThanOrEqual(0.004);
  });
});

describe('glyph room', () => {
  const variants = Object.keys(TEXT_VARIANTS) as TextVariant[];
  const STACKED = 'VIỆT NAM · ĐẶT CHỖ · CHUYẾN ĐI';

  // Every variant, in a Latin, a Vietnamese and a Thai locale, at 1x and 2x text size (laid out as
  // on iOS, which gives up a short line's top): the first line's tallest glyph must fit inside the
  // text box, the face must sit centred on the line, and the text's slot must keep the designed
  // leading (the room is padded in and pulled back out, the centring shift given back below).
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
        const iosBaseline =
          multiplier >= faceHeight
            ? (multiplier - faceHeight) / 2 + metrics.ascent
            : multiplier - metrics.descent;
        const centredBaseline = (multiplier - faceHeight) / 2 + metrics.ascent;
        const paddingTop = (style.paddingTop as number | undefined) ?? 0;
        const marginTop = (style.marginTop as number | undefined) ?? 0;
        const marginBottom = (style.marginBottom as number | undefined) ?? 0;
        expect(paddingTop + iosBaseline * fontSize).toBeGreaterThanOrEqual(
          metrics.glyphTop * fontSize - 0.001,
        );
        // The content's top moves down by the shift that centres the face on the line...
        expect(paddingTop + marginTop + iosBaseline * fontSize).toBeCloseTo(
          centredBaseline * fontSize,
          6,
        );
        // ...and the slot below the text keeps the designed leading.
        expect(paddingTop + marginTop + marginBottom).toBeCloseTo(0, 6);
      }
    }
  });

  it('centres the face on a short line on iOS as Android does', () => {
    // Archivo at the display leading: caps and marks reach 1.059 em. iOS puts the baseline 0.65 em
    // down (descent above the bottom), Android 0.764 em (the face centred on the line).
    const ios = lineBoxEm('Archivo-W70-900', 0.86, 'ios');
    expect(ios.room).toBeCloseTo(0.409, 3);
    expect(ios.shift).toBeCloseTo(0.114, 3);
    const android = lineBoxEm('Archivo-W70-900', 0.86, 'centred');
    expect(android.room).toBeCloseTo(0.295, 3);
    expect(android.shift).toBe(0);
    // Both end with the tallest mark the same distance above the line.
    expect(ios.room - ios.shift).toBeCloseTo(android.room, 6);
    // A line taller than the face is centred on both.
    expect(lineBoxEm('Geist-800', 1.4, 'ios')).toEqual(lineBoxEm('Geist-800', 1.4, 'centred'));
    expect(lineBoxEm('system', 0.86, 'ios')).toEqual({ room: 0, shift: 0 });
  });

  it('adds to the caller’s own spacing and leaves non-numeric spacing alone', () => {
    expect(glyphRoomStyle({ room: 10, shift: 0 }, { paddingTop: 4, marginVertical: 6 })).toEqual({
      paddingTop: 14,
      marginTop: -4,
    });
    expect(glyphRoomStyle({ room: 10, shift: 2 }, { marginBottom: 3 })).toEqual({
      paddingTop: 10,
      marginTop: -8,
      marginBottom: 1,
    });
    // Kept inside its slot, the box never starts above it.
    expect(glyphRoomStyle({ room: 10, shift: 2 }, undefined, true)).toEqual({
      paddingTop: 10,
      marginTop: 0,
      marginBottom: -2,
    });
    expect(glyphRoomStyle({ room: 10, shift: 0 }, { marginTop: 'auto' })).toBeNull();
    expect(glyphRoomStyle({ room: 0, shift: 0 }, undefined)).toBeNull();
  });
});

describe('glyph room at the top of a scroll view', () => {
  const marginTopOf = (element: { props: { style?: unknown } }): number => {
    const margin = (StyleSheet.flatten(element.props.style as TextStyle) ?? {}).marginTop;
    return typeof margin === 'number' ? margin : 0;
  };
  const layoutAt = (y: number) => ({
    nativeEvent: { layout: { x: 0, y, width: 350, height: 100 } },
  });

  it('keeps a first-line heading inside the content, never above its top edge', async () => {
    await renderWithI18n(
      <ThemeProvider fontScale={1}>
        <ScrollView>
          <Text variant="h1" testID="title">
            Your number
          </Text>
        </ScrollView>
      </ThemeProvider>,
    );
    const title = screen.getByTestId('title');
    const pulledUp = marginTopOf(title);
    expect(pulledUp).toBeLessThan(0);
    // Laid out as the first child with no padding above it, the box starts above y = 0.
    await fireEvent(title, 'layout', layoutAt(pulledUp));
    expect(marginTopOf(screen.getByTestId('title'))).toBeGreaterThanOrEqual(0);
  });

  it('keeps the designed tight leading where the parent leaves the room above it', async () => {
    await renderWithI18n(
      <ThemeProvider fontScale={1}>
        <ScrollView contentContainerStyle={{ paddingTop: 24 }}>
          <Text variant="h1" testID="title">
            Your number
          </Text>
        </ScrollView>
      </ThemeProvider>,
    );
    const title = screen.getByTestId('title');
    const pulledUp = marginTopOf(title);
    await fireEvent(title, 'layout', layoutAt(24 + pulledUp));
    expect(marginTopOf(screen.getByTestId('title'))).toBe(pulledUp);
  });

  it('keeps a control label centred where a wrapper puts its box above the wrapper’s top', async () => {
    // A pill's label sits in a wrapper with no padding (a flap, a row with an icon): the room
    // reaches above the wrapper but stays inside the pill, so the label is never pushed down.
    await renderWithI18n(
      <ThemeProvider fontScale={1}>
        <Text variant="buttonSm" testID="label">
          Next
        </Text>
      </ThemeProvider>,
    );
    const label = screen.getByTestId('label');
    const pulledUp = marginTopOf(label);
    expect(pulledUp).toBeLessThan(0);
    await fireEvent(label, 'layout', layoutAt(pulledUp));
    expect(marginTopOf(screen.getByTestId('label'))).toBe(pulledUp);
  });
});
