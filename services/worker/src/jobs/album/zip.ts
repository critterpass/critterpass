/**
 * A streaming ZIP writer for album exports: each photo is stored as it is (already compressed, so
 * no deflate), its CRC computed before its header, so entries need no data descriptor and the
 * archive goes out in order through any sink (an R2 multipart upload in production). Plain ZIP
 * (not ZIP64): an export stops short of 4 GiB.
 */
import { crc32 } from 'node:zlib';

/** Where the archive's bytes go, in order. */
export interface ZipSink {
  write(chunk: Uint8Array): Promise<void>;
}

/** The largest archive plain ZIP offsets can address, with room for the central directory. */
export const ZIP_MAX_BYTES = 0xffff_ffff - 16 * 1024 * 1024;

interface CentralEntry {
  readonly name: Uint8Array;
  readonly crc: number;
  readonly size: number;
  readonly offset: number;
  readonly time: number;
  readonly date: number;
}

function dosDateTime(at: Date): { time: number; date: number } {
  const year = Math.max(1980, at.getUTCFullYear());
  return {
    time: (at.getUTCHours() << 11) | (at.getUTCMinutes() << 5) | Math.floor(at.getUTCSeconds() / 2),
    date: ((year - 1980) << 9) | ((at.getUTCMonth() + 1) << 5) | at.getUTCDate(),
  };
}

export class ZipWriter {
  private offset = 0;
  private readonly entries: CentralEntry[] = [];

  constructor(private readonly sink: ZipSink) {}

  get bytes(): number {
    return this.offset;
  }

  /** Whether `size` more bytes (plus headers) still fit. */
  fits(nameLength: number, size: number): boolean {
    return this.offset + 30 + nameLength + size < ZIP_MAX_BYTES;
  }

  async add(name: string, data: Uint8Array, at: Date): Promise<void> {
    const encoded = new TextEncoder().encode(name);
    const crc = crc32(data);
    const { time, date } = dosDateTime(at);
    const header = new DataView(new ArrayBuffer(30));
    header.setUint32(0, 0x04034b50, true);
    header.setUint16(4, 20, true);
    header.setUint16(6, 0x0800, true); // UTF-8 names
    header.setUint16(8, 0, true); // stored
    header.setUint16(10, time, true);
    header.setUint16(12, date, true);
    header.setUint32(14, crc, true);
    header.setUint32(18, data.byteLength, true);
    header.setUint32(22, data.byteLength, true);
    header.setUint16(26, encoded.byteLength, true);
    header.setUint16(28, 0, true);
    this.entries.push({
      name: encoded,
      crc,
      size: data.byteLength,
      offset: this.offset,
      time,
      date,
    });
    await this.emit(new Uint8Array(header.buffer));
    await this.emit(encoded);
    await this.emit(data);
  }

  async finish(): Promise<void> {
    const start = this.offset;
    for (const entry of this.entries) {
      const header = new DataView(new ArrayBuffer(46));
      header.setUint32(0, 0x02014b50, true);
      header.setUint16(4, 20, true);
      header.setUint16(6, 20, true);
      header.setUint16(8, 0x0800, true);
      header.setUint16(10, 0, true);
      header.setUint16(12, entry.time, true);
      header.setUint16(14, entry.date, true);
      header.setUint32(16, entry.crc, true);
      header.setUint32(20, entry.size, true);
      header.setUint32(24, entry.size, true);
      header.setUint16(28, entry.name.byteLength, true);
      header.setUint32(42, entry.offset, true);
      await this.emit(new Uint8Array(header.buffer));
      await this.emit(entry.name);
    }
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, this.entries.length, true);
    end.setUint16(10, this.entries.length, true);
    end.setUint32(12, this.offset - start, true);
    end.setUint32(16, start, true);
    await this.emit(new Uint8Array(end.buffer));
  }

  private async emit(chunk: Uint8Array): Promise<void> {
    this.offset += chunk.byteLength;
    await this.sink.write(chunk);
  }
}
