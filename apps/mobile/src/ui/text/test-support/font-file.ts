/* eslint-disable lingui/no-unlocalized-strings -- font table tags, file names and sample letters; test support, never copy. */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const FONTS_DIR = join(__dirname, '../../../../assets/fonts');

/** The bundled faces (`Archivo-W62-900.ttf`…), optionally of one family. */
export function fontFiles(family?: string): readonly string[] {
  return readdirSync(FONTS_DIR).filter(
    (name) => name.endsWith('.ttf') && (family === undefined || name.startsWith(`${family}-`)),
  );
}

export interface FontFile {
  /** hhea line metrics, in em. */
  readonly ascent: number;
  readonly descent: number;
  /** False for a character the face has no glyph for, or one that draws nothing (a space). */
  readonly draws: (char: string) => boolean;
  /** The outline's highest and lowest point, in em above and below the baseline. */
  readonly extent: (char: string) => { readonly top: number; readonly bottom: number };
  /** The horizontal advance, in em. */
  readonly advance: (char: string) => number;
}

/** Minimal TrueType reader over a bundled font: line metrics, glyph bounds and advances. */
export function readFontFile(file: string): FontFile {
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
  const longMetrics = view.getUint16(hhea + 34);
  const hmtx = table('hmtx');

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
  const glyphFor = (char: string): number => {
    const code = char.codePointAt(0) ?? 0;
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
  const draws = (char: string) => {
    const id = glyphFor(char);
    return id !== 0 && locaAt(id) !== locaAt(id + 1);
  };
  return {
    ascent: view.getInt16(hhea + 4) / unitsPerEm,
    descent: -view.getInt16(hhea + 6) / unitsPerEm,
    draws,
    extent: (char) => {
      if (!draws(char)) return { top: -Infinity, bottom: -Infinity };
      const glyph = glyf + locaAt(glyphFor(char));
      return {
        top: view.getInt16(glyph + 8) / unitsPerEm,
        bottom: -view.getInt16(glyph + 4) / unitsPerEm,
      };
    },
    advance: (char) =>
      view.getUint16(hmtx + Math.min(glyphFor(char), longMetrics - 1) * 4) / unitsPerEm,
  };
}

export const LATIN_LETTERS =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789ÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝŸİŞĞ';
export const VIETNAMESE_LETTERS =
  'ĐđẠẢẤẦẨẪẬẮẰẲẴẶẸẺẼẾỀỂỄỆỈỊỌỎỐỒỔỖỘỚỜỞỠỢỤỦỨỪỬỮỰỲỴỶỸạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ';
