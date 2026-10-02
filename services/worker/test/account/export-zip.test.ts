/**
 * The export's zip writer: CRC-32 matches the standard check value, and an archive reads back with
 * every entry intact (names in UTF-8, bytes unchanged) and the system `unzip` accepts it.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { crc32, readStoredZip, writeZip } from '../../src/jobs/account/zip';

const text = (value: string) => new TextEncoder().encode(value);

describe('export zip', () => {
  it('computes CRC-32 to the standard check value', () => {
    expect(crc32(text('123456789'))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });

  it('writes entries that read back unchanged', () => {
    const entries = [
      { name: 'profile.json', bytes: text('{"name":"Khánh"}') },
      { name: 'media/ảnh.jpg', bytes: new Uint8Array([0xff, 0xd8, 0xff, 0x00, 0x10]) },
    ];
    const archive = writeZip(entries, new Date('2026-10-03T09:00:00Z'));
    const back = readStoredZip(archive);
    expect(back.map((entry) => entry.name)).toEqual(['profile.json', 'media/ảnh.jpg']);
    expect(Array.from(back[1]?.bytes ?? [])).toEqual([0xff, 0xd8, 0xff, 0x00, 0x10]);
  });

  it('is an archive the system unzip tests clean', () => {
    const dir = mkdtempSync(join(tmpdir(), 'export-zip-'));
    try {
      const file = join(dir, 'export.zip');
      writeFileSync(file, writeZip([{ name: 'a/b.json', bytes: text('[]') }]));
      const out = execFileSync('unzip', ['-t', file]).toString();
      expect(out).toContain('No errors detected');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
