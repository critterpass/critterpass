import { describe, expect, it } from 'vitest';

import { readMetaDataBoolean, setMetaDataBoolean } from './android-manifest';

/** Minimal compiled XML: a string pool, then one start-element chunk per `<meta-data>`. */
function compiledManifest(
  entries: readonly { name: string; value: boolean | string }[],
  utf8: boolean,
): Buffer {
  const strings = ['meta-data', 'name', 'value', ...entries.map((entry) => entry.name)];
  for (const { value } of entries) if (typeof value === 'string') strings.push(value);
  const encoded = strings.map((text) => {
    if (utf8) {
      const bytes = Buffer.from(text, 'utf8');
      return Buffer.concat([Buffer.from([text.length, bytes.length]), bytes, Buffer.from([0])]);
    }
    const units = Buffer.alloc(2);
    units.writeUInt16LE(text.length);
    return Buffer.concat([units, Buffer.from(text, 'utf16le'), Buffer.alloc(2)]);
  });
  const offsets = Buffer.alloc(strings.length * 4);
  let offset = 0;
  encoded.forEach((entry, i) => {
    offsets.writeUInt32LE(offset, i * 4);
    offset += entry.length;
  });
  const data = Buffer.concat(encoded);
  const padded = Buffer.concat([data, Buffer.alloc((4 - (data.length % 4)) % 4)]);
  const poolHeader = Buffer.alloc(28);
  poolHeader.writeUInt16LE(0x0001, 0);
  poolHeader.writeUInt16LE(28, 2);
  poolHeader.writeUInt32LE(28 + offsets.length + padded.length, 4);
  poolHeader.writeUInt32LE(strings.length, 8);
  poolHeader.writeUInt32LE(utf8 ? 1 << 8 : 0, 16);
  poolHeader.writeUInt32LE(28 + offsets.length, 20);
  const pool = Buffer.concat([poolHeader, offsets, padded]);

  const elements = entries.map(({ name, value }) => {
    const chunk = Buffer.alloc(16 + 20 + 2 * 20);
    chunk.writeUInt16LE(0x0102, 0);
    chunk.writeUInt16LE(16, 2);
    chunk.writeUInt32LE(chunk.length, 4);
    chunk.writeUInt32LE(0xffffffff, 12);
    chunk.writeUInt32LE(0xffffffff, 16);
    chunk.writeUInt32LE(strings.indexOf('meta-data'), 20);
    chunk.writeUInt16LE(20, 24);
    chunk.writeUInt16LE(20, 26);
    chunk.writeUInt16LE(2, 28);
    const attr = (i: number, attrName: string, raw: number, type: number, payload: number) => {
      const at = 36 + i * 20;
      chunk.writeUInt32LE(0xffffffff, at);
      chunk.writeUInt32LE(strings.indexOf(attrName), at + 4);
      chunk.writeUInt32LE(raw, at + 8);
      chunk.writeUInt16LE(8, at + 12);
      chunk[at + 15] = type;
      chunk.writeUInt32LE(payload, at + 16);
    };
    const nameIndex = strings.indexOf(name);
    attr(0, 'name', nameIndex, 0x03, nameIndex);
    if (typeof value === 'string') {
      const valueIndex = strings.indexOf(value);
      attr(1, 'value', valueIndex, 0x03, valueIndex);
    } else {
      attr(1, 'value', 0xffffffff, 0x12, value ? 0xffffffff : 0);
    }
    return chunk;
  });
  const body = Buffer.concat([pool, ...elements]);
  const header = Buffer.alloc(8);
  header.writeUInt16LE(0x0003, 0);
  header.writeUInt16LE(8, 2);
  header.writeUInt32LE(8 + body.length, 4);
  return Buffer.concat([header, body]);
}

const ENABLED = 'expo.modules.updates.ENABLED';
const OTHER = 'expo.modules.updates.ENABLE_BSDIFF_PATCH_SUPPORT';

describe.each([
  ['UTF-16', false],
  ['UTF-8', true],
])('setMetaDataBoolean with a %s string pool', (_label, utf8) => {
  const manifest = compiledManifest(
    [
      { name: OTHER, value: true },
      { name: ENABLED, value: true },
      { name: 'expo.modules.updates.EXPO_UPDATES_CHECK_ON_LAUNCH', value: 'ALWAYS' },
    ],
    utf8,
  );

  it('flips only the named entry and keeps the file size', () => {
    const patched = setMetaDataBoolean(manifest, ENABLED, false);
    expect(patched.length).toBe(manifest.length);
    expect(readMetaDataBoolean(patched, ENABLED)).toBe(false);
    expect(readMetaDataBoolean(patched, OTHER)).toBe(true);
    expect(readMetaDataBoolean(manifest, ENABLED)).toBe(true);
    expect(readMetaDataBoolean(setMetaDataBoolean(patched, ENABLED, true), ENABLED)).toBe(true);
  });

  it('throws when the entry is missing', () => {
    expect(() => setMetaDataBoolean(manifest, 'missing.key', false)).toThrow(/No <meta-data/);
  });
});

describe('setMetaDataBoolean input checks', () => {
  it('rejects a file that is not compiled XML', () => {
    expect(() => setMetaDataBoolean(Buffer.from('<manifest/>xx'), ENABLED, false)).toThrow(
      /Not a compiled/,
    );
  });
});
