import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { androidRecordLoop, segmentFiles } from './screen-video';

describe('screen video', () => {
  it('records back-to-back three-minute segments until the stop file appears', () => {
    const loop = androidRecordLoop();
    expect(loop).toContain('while [ ! -f /sdcard/cp-video/stop ]');
    expect(loop).toContain('--time-limit 180 /sdcard/cp-video/seg-$i.mp4');
  });

  it('lists segments in recording order and ignores other files', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'screen-video-'));
    for (const name of ['seg-101.mp4', 'seg-100.mp4', 'stop', 'seg-99.txt'])
      writeFileSync(path.join(dir, name), '');
    expect(segmentFiles(dir).map((file) => path.basename(file))).toEqual([
      'seg-100.mp4',
      'seg-101.mp4',
    ]);
    expect(segmentFiles(path.join(dir, 'missing'))).toEqual([]);
  });
});
