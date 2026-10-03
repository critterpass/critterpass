/**
 * The album's two byte-level helpers: the EXIF GPS check tells a photo still carrying a position
 * from one without, and the streaming zip writer makes an archive whose central directory lists
 * every photo at the offset its bytes start.
 */
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { exifHasGps } from '../../src/jobs/album/exif-gps';
import { ZipWriter } from '../../src/jobs/album/zip';

async function jpeg(exif?: Record<string, Record<string, string>>): Promise<Uint8Array> {
  let image = sharp({ create: { width: 8, height: 8, channels: 3, background: '#f80' } }).jpeg();
  if (exif !== undefined) image = image.withExif(exif);
  return new Uint8Array(await image.toBuffer());
}

async function exifOf(bytes: Uint8Array): Promise<Uint8Array | undefined> {
  const exif = (await sharp(bytes).metadata()).exif;
  return exif === undefined ? undefined : new Uint8Array(exif);
}

describe('exifHasGps', () => {
  it('finds a GPS position and nothing in a photo without one', async () => {
    const located = await jpeg({ IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '16/1 3/1 0/1' } });
    const plain = await jpeg({ IFD0: { Copyright: 'crew' } });
    expect(exifHasGps(await exifOf(located))).toBe(true);
    expect(exifHasGps(await exifOf(plain))).toBe(false);
    expect(exifHasGps(await exifOf(await jpeg()))).toBe(false);
    expect(exifHasGps(new Uint8Array([1, 2, 3]))).toBe(false);
  });
});

describe('ZipWriter', () => {
  it('stores each file whole and lists them all in the central directory', async () => {
    const chunks: Uint8Array[] = [];
    const zip = new ZipWriter({
      write: (chunk) => {
        chunks.push(chunk);
        return Promise.resolve();
      },
    });
    const files = [
      ['20261003-043000-0001.jpg', new TextEncoder().encode('first photo')],
      ['20261003-051500-0002.jpg', new TextEncoder().encode('second, a little longer')],
    ] as const;
    for (const [name, data] of files) await zip.add(name, data, new Date('2026-10-03T04:30:00Z'));
    await zip.finish();
    const all = Buffer.concat(chunks);
    expect(all.byteLength).toBe(zip.bytes);
    const end = all.byteLength - 22;
    expect(all.readUInt32LE(end)).toBe(0x06054b50);
    expect(all.readUInt16LE(end + 10)).toBe(2);
    let at = all.readUInt32LE(end + 16);
    for (const [name, data] of files) {
      expect(all.readUInt32LE(at)).toBe(0x02014b50);
      const nameLength = all.readUInt16LE(at + 28);
      expect(all.subarray(at + 46, at + 46 + nameLength).toString()).toBe(name);
      const local = all.readUInt32LE(at + 42);
      expect(all.readUInt32LE(local)).toBe(0x04034b50);
      const start = local + 30 + all.readUInt16LE(local + 26);
      expect(all.subarray(start, start + data.byteLength)).toEqual(Buffer.from(data));
      at += 46 + nameLength;
    }
  });
});
